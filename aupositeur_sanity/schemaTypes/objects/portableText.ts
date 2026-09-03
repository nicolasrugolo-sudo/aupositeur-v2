import {defineType} from 'sanity'

export const portableText = defineType({
  name: 'portableText',
  title: 'Texte riche',
  type: 'array',
  of: [
    {type: 'block'},
    {type: 'imageWithAlt'},
  ],
})