import {defineField, defineType} from 'sanity'

export const link = defineType({
  name: 'link',
  title: 'Lien',
  type: 'object',
  fields: [
    defineField({name: 'label', title: 'Libellé', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'url', title: 'URL', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'openInNewTab',
      title: 'Ouvrir dans un nouvel onglet',
      type: 'boolean',
      initialValue: false,
    }),
  ],
})