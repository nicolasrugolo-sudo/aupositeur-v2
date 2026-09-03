import {defineField, defineType} from 'sanity'

export const homePage = defineType({
  name: 'homePage',
  title: 'Accueil',
  type: 'document',
  fields: [
    defineField({
      name: 'heroTitleFirst',
      title: 'Titre — première ligne',
      type: 'string',
      initialValue: 'Je dépose',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'heroTitleSecond',
      title: 'Titre — seconde ligne',
      type: 'string',
      initialValue: 'ce qui résiste',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'heroIntroFirst',
      title: 'Introduction — première ligne',
      type: 'string',
      initialValue: 'Des mots écrits par un homme.',
    }),
    defineField({
      name: 'heroIntroSecond',
      title: 'Introduction — seconde ligne',
      type: 'string',
      initialValue: 'Des musiques rêvées avec des machines.',
    }),
    defineField({
      name: 'heroImage',
      title: 'Portrait',
      type: 'imageWithAlt',
    }),

    defineField({
      name: 'featuredWriting',
      title: 'Écrit mis en avant',
      type: 'reference',
      to: [{type: 'writing'}],
    }),

    defineField({
      name: 'featuredQuote',
      title: 'Citation mise en avant',
      type: 'reference',
      to: [{type: 'citation'}],
    }),

    defineField({
      name: 'featuredMusic',
      title: 'Musique mise en avant',
      type: 'reference',
      to: [{type: 'musicTrack'}],
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
        title: 'Accueil',
        subtitle: 'Page d’accueil du site',
      }
    },
  },
})