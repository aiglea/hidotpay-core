import { readModelWriterRole } from './read-model-role.mjs';

export async function configureReadModelRole(client, definition) {
  const { resources, ...role } = definition;
  const existingRoles = new Set(await client.listRoles());
  if (existingRoles.has(role.name)) await client.updateRole(role.name, role);
  else await client.createRole(role);
  await client.updateMainDataSourceRole(role.name, {
    resources,
    strategy: role.strategy,
  });
}

export async function configureReadModelWriter(client) {
  await configureReadModelRole(client, readModelWriterRole);
}
