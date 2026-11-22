import { MAX_CONDITION_LENGTH, MAX_DEPTH, MAX_NODES, MAX_WHERE_CLAUSES } from './conditionSchema.ts'
import { isObject, has, pointValueOf, type Json, type Path, type Problem } from './guard.ts'
import { classifyNode, classifyOperand } from './guardClassify.ts'

export interface Measure {
  depth: number
  nodes: number
  problem: Problem | null
}

/**
 * The save-time limits, counted the way `ConditionSchema.Validate` counts them: the root is depth 1, a group's child,
 * an operand and an operand's `of` each go one deeper, and a query goes none deeper; operands and queries count as
 * nodes; a query holds at most eight clauses; the text is at most 32768 long. The first limit passed is the problem.
 */
export function measure(condition: Json): Measure {
  let nodes = 0
  let depth = 0
  let problem: Problem | null = null

  if (JSON.stringify(condition).length > MAX_CONDITION_LENGTH) {
    return { depth, nodes, problem: { key: 'limits.size', path: [] } }
  }

  function enter(path: Path, at: number) {
    depth = Math.max(depth, at)
    if (at > MAX_DEPTH) {
      problem = { key: 'limits.depth', path }
      return false
    }
    nodes += 1
    if (nodes > MAX_NODES) {
      problem = { key: 'limits.nodes', path }
      return false
    }
    return true
  }

  function node(value: Json | undefined, path: Path, at: number) {
    if (problem || value === undefined || !enter(path, at) || !isObject(value)) return
    switch (value.kind) {
      case 'all':
      case 'any':
        if (Array.isArray(value.of)) {
          value.of.forEach((child, index) => node(child, [...path, 'of', index], at + 1))
        }
        return
      case 'not':
        if (isObject(value.of)) node(value.of, [...path, 'of'], at + 1)
        return
      case 'compare':
        operand(value.left, [...path, 'left'], at + 1)
        operand(value.right, [...path, 'right'], at + 1)
        return
      case 'exists':
        query(value.query, [...path, 'query'], at)
        return
      case 'related':
        operand(value.from, [...path, 'from'], at + 1)
        operand(value.to, [...path, 'to'], at + 1)
        return
      case 'within':
        operand(value.point, [...path, 'point'], at + 1)
        operand(value.from, [...path, 'from'], at + 1)
        operand(value.to, [...path, 'to'], at + 1)
        return
    }
  }

  function operand(value: Json | undefined, path: Path, at: number) {
    if (problem || value === undefined || !enter(path, at) || !isObject(value)) return
    if (has(value, 'literal')) return
    if (has(value, 'attribute') || has(value, 'field')) {
      operand(value.of, [...path, 'of'], at + 1)
    } else if (has(value, 'count')) {
      query(value.count, [...path, 'count'], at)
    }
  }

  function query(value: Json | undefined, path: Path, at: number) {
    if (problem || value === undefined) return
    nodes += 1
    if (nodes > MAX_NODES) {
      problem = { key: 'limits.nodes', path }
      return
    }
    if (!isObject(value) || !Array.isArray(value.where)) return
    if (value.where.length > MAX_WHERE_CLAUSES) {
      problem = { key: 'limits.where', path }
      return
    }
    value.where.forEach((clause, index) => {
      if (isObject(clause) && has(clause, 'operandValue')) {
        operand(clause.operandValue, [...path, 'where', index, 'operandValue'], at + 1)
      }
    })
  }

  node(condition, [], 1)
  return { depth, nodes, problem }
}

/** What is left unfinished in the editable parts: each would be refused or could never hold. */
export function checkComplete(condition: Json): Problem[] {
  const problems: Problem[] = []

  function value(literal: Json | undefined, type: Json | undefined, path: Path) {
    if (type === 'number' && typeof literal !== 'number') {
      problems.push({ key: 'required.number', path })
    }
    if (
      type === 'timePoint' &&
      (typeof literal !== 'string' || pointValueOf(literal).trim() === '')
    ) {
      problems.push({ key: 'required.timePoint', path })
    }
  }

  function query(at: Json | undefined, path: Path) {
    if (!isObject(at) || !Array.isArray(at.where)) return
    at.where.forEach((clause, index) => {
      if (isObject(clause) && has(clause, 'value')) {
        value(clause.value, clause.type, [...path, 'where', index])
      }
    })
  }

  function operand(at: Json | undefined, path: Path) {
    const kind = classifyOperand(at)
    if (!isObject(at)) return
    if (kind === 'attribute' && String(at.attribute).trim() === '') {
      problems.push({ key: 'required.attribute', path })
    } else if (kind === 'literal') {
      value(at.literal, at.type, path)
    } else if (kind === 'count') {
      query(at.count, [...path, 'count'])
    }
  }

  function node(at: Json | undefined, path: Path) {
    const kind = classifyNode(at)
    if (!isObject(at)) return
    if (kind === 'all' || kind === 'any') {
      const children = at.of as Json[]
      if (children.length === 0) problems.push({ key: 'required.group', path })
      children.forEach((child, index) => node(child, [...path, 'of', index]))
    } else if (kind === 'not') {
      node(at.of, [...path, 'of'])
    } else if (kind === 'compare') {
      operand(at.left, [...path, 'left'])
      operand(at.right, [...path, 'right'])
    } else if (kind === 'exists') {
      query(at.query, [...path, 'query'])
    } else if (kind === 'related') {
      if (String(at.relation).trim() === '') problems.push({ key: 'required.relation', path })
      operand(at.from, [...path, 'from'])
      operand(at.to, [...path, 'to'])
    }
  }

  node(condition, [])
  return problems
}
