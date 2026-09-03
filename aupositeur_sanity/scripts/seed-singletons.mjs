import {getCliClient} from 'sanity/cli'

const client = getCliClient({
  apiVersion: '2026-09-03',
})

const documents = [
  {
    _id: 'homePage',
    _type: 'homePage',

    heroTitleFirst: 'Je dépose',
    heroTitleSecond: 'ce qui résiste',

    heroIntroFirst: 'Des mots écrits par un homme.',
    heroIntroSecond: 'Des musiques rêvées avec des machines.',

    featuredWriting: {
      _type: 'reference',
      _ref: 'aupositeur-writing-plus-vieux-que-moi-meme',
    },

    featuredQuote: {
      _type: 'reference',
      _ref: 'aupositeur-citation-ames-continuent-a-parler',
    },
  },

  {
    _id: 'aboutPage',
    _type: 'aboutPage',

    kicker: 'À propos',

    titleFirst: 'Un atelier',
    titleSecond: 'ouvert.',

    location: 'Bruxelles',

    lead:
      'Aupositeur est un espace de création où se rencontrent les mots, les sons et les images.',

    manifestoLeft:
      'Il y a d’abord l’écriture. Des phrases, des poèmes, des fragments. Des choses qui demandent parfois beaucoup de mots et parfois presque aucun.',

    manifestoRight:
      'Puis il y a la musique, les images, les livres et les objets. Non pas comme des disciplines séparées, mais comme différentes manières de poursuivre une même conversation.',

    statementFirst: 'Je dépose',
    statementSecond: 'ce qui résiste.',

    principles: [
      {
        _key: 'write',
        _type: 'object',
        title: 'Écrire',
        text: 'Garder une trace de ce qui aurait pu disparaître sans bruit.',
      },
      {
        _key: 'transform',
        _type: 'object',
        title: 'Transformer',
        text: 'Laisser un texte devenir musique, image, livre ou objet lorsqu’il le demande.',
      },
      {
        _key: 'share',
        _type: 'object',
        title: 'Partager',
        text: 'Mettre les œuvres dehors et accepter qu’elles poursuivent leur chemin ailleurs.',
      },
    ],

    endingFirst: 'Des mots écrits par un homme.',
    endingSecond: 'Des musiques rêvées avec des machines.',

    seo: {
      _type: 'seo',
      title: 'À propos — Aupositeur',
      description:
        'À propos d’Aupositeur, un atelier ouvert où se rencontrent les mots, les sons et les images.',
    },
  },

  {
    _id: 'navigation',
    _type: 'navigation',
    title: 'Navigation principale',

    items: [
      {_key: 'home', _type: 'link', label: 'Accueil', url: '/'},
      {_key: 'writings', _type: 'link', label: 'Écrits', url: '/ecrits/'},
      {_key: 'music', _type: 'link', label: 'Musiques', url: '/musiques/'},
      {_key: 'books', _type: 'link', label: 'Livres', url: '/livres/'},
      {_key: 'quotes', _type: 'link', label: 'Citations', url: '/citations/'},
      {_key: 'shop', _type: 'link', label: 'Boutique', url: '/boutique/'},
      {_key: 'about', _type: 'link', label: 'À propos', url: '/a-propos/'},
    ],
  },
]

console.log('Préparation des singletons Aupositeur...')

for (const document of documents) {
  await client.createOrReplace(document)
  console.log(`OK : ${document._id}`)
}

console.log('Terminé : 3 documents créés ou mis à jour.')