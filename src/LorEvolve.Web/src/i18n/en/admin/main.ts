const adminMain = {
  title: 'Main',
  lede: 'What LorEvolve records about the service, counted when this page opened. Times are UTC.',
  counting: 'Counting…',
  measured: 'Measured',
  counted: 'Counted {time}.',
  stats: {
    accounts: {
      label: 'Accounts',
      source: 'Every account that exists.',
    },
    admins: {
      label: 'Admins',
      source: 'Accounts with the Admin role.',
    },
    blocked: {
      label: 'Blocked accounts',
      source: 'Blocked now.',
    },
    universes: {
      label: 'Universes',
      source: 'Every universe that exists, archived included.',
    },
    public: {
      label: 'Public universes',
      source: 'Published on the portal now.',
    },
    collaborations: {
      label: 'Collaborations',
      source: 'Collaborator places across all universes.',
    },
    storage: {
      label: 'Stored pictures',
      source: 'Originals of Lore pictures, Trash included, as storage allowances count them.',
    },
    apps: {
      label: 'Connected AI apps',
      source: 'Live MCP connections.',
    },
  },
  trend: {
    heading: 'Universes created per month',
    note: 'By creation date, UTC. Universes deleted since are not counted.',
  },
}

export default adminMain
