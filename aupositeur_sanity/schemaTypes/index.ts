import {seo} from './objects/seo'
import {imageWithAlt} from './objects/imageWithAlt'
import {link} from './objects/link'
import {productVariant} from './objects/productVariant'
import {portableText} from './objects/portableText'

import {citation} from './documents/citation'
import {writing} from './documents/writing'
import {musicTrack} from './documents/musicTrack'
import {book} from './documents/book'
import {product} from './documents/product'
import {homePage} from './documents/homePage'
import {aboutPage} from './documents/aboutPage'
import {navigation} from './documents/navigation'
import {siteSettings} from './documents/siteSettings'

export const schemaTypes = [
  seo,
  imageWithAlt,
  link,
  productVariant,
  portableText,

  citation,
  writing,
  musicTrack,
  book,
  product,

  homePage,
  aboutPage,
  navigation,
  siteSettings,
]