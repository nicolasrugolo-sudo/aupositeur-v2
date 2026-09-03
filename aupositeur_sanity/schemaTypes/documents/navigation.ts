import {defineField, defineType} from 'sanity'

export const navigation = defineType({
  name: 'navigation',
  title: 'Navigation',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Nom',
      type: 'string',
      initialValue: 'Navigation principale',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'items',
      title: 'Liens',
      type: 'array',
      of: [{type: 'link'}],
    }),
  ],
})