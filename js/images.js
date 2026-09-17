/* Display-only mapping: preserve original URLs in orders and database writes. */
function menuImage(url) {
  return typeof IMG_MAP !== 'undefined' && IMG_MAP[url] || url || '';
}
function fallbackMenuImage(image, original) {
  if (!image.dataset.originalTried && original && image.getAttribute('src') !== original) {
    image.dataset.originalTried = '1';
    image.src = original;
  } else {
    const placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="480"%3E%3Crect width="640" height="480" fill="%23e8ddd0"/%3E%3C/svg%3E';
    if (image.getAttribute('src') !== placeholder) image.src = placeholder;
  }
}
