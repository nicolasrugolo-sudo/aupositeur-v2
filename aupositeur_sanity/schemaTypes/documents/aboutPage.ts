import {defineField, defineType} from 'sanity'

export const aboutPage = defineType({
  name: 'aboutPage',
  title: 'À propos',
  type: 'document',
  fields: [
    defineField({
      name: 'kicker',
      title: 'Sur-titre',
      type: 'string',
      initialValue: 'À propos',
    }),
    defineField({
      name: 'titleFirst',
      title: 'Titre — première ligne',
      type: 'string',
      initialValue: 'Un atelier',
    }),
    defineField({
      name: 'titleSecond',
      title: 'Titre — seconde ligne',
      type: 'string',
      initialValue: 'ouvert.',
    }),
    defineField({
      name: 'portrait',
      title: 'Portrait',
      type: 'imageWithAlt',
    }),
    defineField({
      name: 'location',
      title: 'Lieu',
      type: 'string',
      initialValue: 'Bruxelles',
    }),
    defineField({
      name: 'lead',
      title: 'Introduction',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'manifestoLeft',
      title: 'Manifeste — colonne gauche',
      type: 'text',
      rows: 6,
    }),
    defineField({
      name: 'manifestoRight',
      title: 'Manifeste — colonne droite',
      type: 'text',
      rows: 6,
    }),
    defineField({
      name: 'statementFirst',
      title: 'Phrase manifeste — première ligne',
      type: 'string',
      initialValue: 'Je dépose',
    }),
    defineField({
      name: 'statementSecond',
      title: 'Phrase manifeste — seconde ligne',
      type: 'string',
      initialValue: 'ce qui résiste.',
    }),
    defineField({
      name: 'principles',
      title: 'Principes',
      type: 'array',
      validation: (rule) => rule.max(3),
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'title',
              title: 'Titre',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'text',
              title: 'Texte',
              type: 'text',
              rows: 4,
            }),
          ],
          preview: {
            select: {
              title: 'title',
              subtitle: 'text',
            },
          },
        },
      ],
    }),
    defineField({
      name: 'endingFirst',
      title: 'Signature — première ligne',
      type: 'string',
      initialValue: 'Des mots écrits par un homme.',
    }),
    defineField({
      name: 'endingSecond',
      title: 'Signature — seconde ligne',
      type: 'string',
      initialValue: 'Des musiques rêvées avec des machines.',
    }),
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'seo',
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'À propos',
        subtitle: 'Manifeste Aupositeur',
      }
    },
  },
})