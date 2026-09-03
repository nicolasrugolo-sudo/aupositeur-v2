import {defineField, defineType} from 'sanity'

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Réglages du site',
  type: 'document',
  fields: [
    defineField({name: 'siteTitle', title: 'Nom du site', type: 'string', initialValue: 'Aupositeur'}),
    defineField({name: 'siteDescription', title: 'Description générale', type: 'text', rows: 4}),
    defineField({name: 'authorName', title: 'Nom affiché', type: 'string', initialValue: 'Aupositeur'}),
    defineField({name: 'defaultSeo', title: 'SEO par défaut', type: 'seo'}),
  ],
})