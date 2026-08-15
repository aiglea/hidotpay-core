import { readModelCollections } from './read-model-schema.mjs';

export const readModelWriterRole = {
  allowConfigure: false,
  allowNewMenu: false,
  default: false,
  hidden: true,
  name: 'hidotpay_admin_read_model_writer',
  resources: readModelCollections.map((collection) => ({
    actions: [{
      fields: collection.fields.map((field) => field.name),
      name: 'updateOrCreate',
    }],
    dataSourceKey: 'main',
    name: collection.name,
    usingActionsConfig: true,
  })),
  snippets: [],
  strategy: { actions: [] },
  title: 'HiDot Pay 唯讀投影寫入服務',
};

export const financeViewerRole = {
  allowConfigure: false,
  allowNewMenu: false,
  default: false,
  hidden: false,
  name: 'hidotpay_finance_viewer',
  resources: readModelWriterRole.resources.map((resource) => ({
    actions: [
      { fields: resource.actions[0].fields, name: 'list' },
      { fields: resource.actions[0].fields, name: 'get' },
    ],
    dataSourceKey: 'main',
    name: resource.name,
    usingActionsConfig: true,
  })),
  snippets: ['!ui.*', '!pm', '!pm.*'],
  strategy: { actions: [] },
  title: 'HiDot Pay 財務檢視者',
};

export function bootstrapApiKeyResources() {
  return [
    ...readModelWriterRole.resources,
    {
      actions: [{ fields: [], name: 'create' }],
      dataSourceKey: 'main',
      name: 'apiKeys',
      usingActionsConfig: true,
    },
  ];
}
