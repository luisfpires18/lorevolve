/** Universe roles: their names and one line each, shared by invitations and the collaborators panel (#101). */
const roles = {
  owner: {
    label: 'Owner',
    description: 'Owns this universe.',
  },
  editor: {
    label: 'Editor',
    description:
      'Can create and edit content, use Trash and restore items. Cannot permanently delete, publish, or manage the universe.',
  },
  reviewer: {
    label: 'Reviewer',
    description: 'Can read, comment and suggest changes. Cannot edit content directly.',
  },
  viewer: {
    label: 'Viewer',
    description: 'Can read the shared universe.',
  },
}

export default roles
