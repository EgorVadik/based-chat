export function isAllowedStreamOrigin(origin: string) {
  if (process.env.SITE_URL && origin === process.env.SITE_URL) {
    return true
  }

  if (process.env.NODE_ENV === 'development') {
    return (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('http://10.')
    )
  }

  return false
}

export function applyCorsHeaders(response: Response, request: Request) {
  const requestOrigin = request.headers.get('origin')
  if (requestOrigin && isAllowedStreamOrigin(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  } else if (process.env.SITE_URL) {
    response.headers.set('Access-Control-Allow-Origin', process.env.SITE_URL)
  }

  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  )
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Vary', 'Origin')
  return response
}
