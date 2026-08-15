const projectionFields = {
  hidotpay_admin_wallet_addresses: ['address', 'network', 'status'],
  hidotpay_admin_deposit_receipts: ['amount_atoms', 'asset_code', 'blnk_status', 'confirmation_count', 'network', 'transaction_hash'],
  hidotpay_admin_withdrawal_requests: ['amount_atoms', 'asset_code', 'destination_address', 'fee_atoms', 'network', 'status'],
  hidotpay_admin_ledger_transactions: ['actor_id', 'status', 'transaction_type'],
  hidotpay_admin_withdrawal_risk_decisions: ['decision', 'rule_code', 'withdrawal_id'],
};

function sourceFields() {
  return [
    { interface: 'input', name: 'source_id', type: 'string', unique: true },
    { interface: 'datetime', name: 'source_updated_at', type: 'date' },
  ];
}

export const readModelCollections = [
  {
    fields: [
      { interface: 'input', name: 'name', type: 'string', unique: true },
      { interface: 'datetime', name: 'projected_at', type: 'date' },
    ],
    name: 'hidotpay_admin_projection_status',
    title: 'HiDot Pay 投影狀態',
  },
  ...Object.entries(projectionFields).map(([name, fields]) => ({
    fields: [...sourceFields(), ...fields.map((field) => ({ interface: 'input', name: field, type: 'string' }))],
    name,
    title: name.replace('hidotpay_admin_', 'HiDot Pay '),
  })),
];

export async function bootstrapReadModel(client) {
  const existingCollections = new Set(await client.listCollections());
  const existingFields = new Set(await client.listFields());
  for (const collection of readModelCollections) {
    if (!existingCollections.has(collection.name)) await client.createCollection({ name: collection.name, title: collection.title });
    for (const field of collection.fields) {
      const key = `${collection.name}:${field.name}`;
      if (!existingFields.has(key)) await client.createField({ collectionName: collection.name, ...field });
    }
  }
}
