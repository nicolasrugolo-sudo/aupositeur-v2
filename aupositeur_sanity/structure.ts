import type {StructureResolver} from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Aupositeur')
    .items([
      S.listItem()
        .title('Accueil')
        .child(
          S.document()
            .schemaType('homePage')
            .documentId('homePage')
            .title('Accueil')
        ),

      S.divider(),

      S.documentTypeListItem('writing')
        .title('Écrits'),

      S.documentTypeListItem('citation')
        .title('Citations'),

      S.documentTypeListItem('musicTrack')
        .title('Musiques'),

      S.documentTypeListItem('book')
        .title('Livres'),

      S.documentTypeListItem('product')
        .title('Boutique'),

      S.divider(),

      S.listItem()
        .title('À propos')
        .child(
          S.document()
            .schemaType('aboutPage')
            .documentId('aboutPage')
            .title('À propos')
        ),

      S.divider(),

      S.listItem()
        .title('Navigation')
        .child(
          S.document()
            .schemaType('navigation')
            .documentId('navigation')
            .title('Navigation')
        ),

      S.listItem()
        .title('Réglages du site')
        .child(
          S.document()
            .schemaType('siteSettings')
            .documentId('siteSettings')
            .title('Réglages du site')
        ),
    ])