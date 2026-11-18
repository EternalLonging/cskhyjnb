const path = require('path');

function resolveStaticPath(rootDir, requestUrl) {
  const rootPath = path.resolve(rootDir);
  const rawPath = String(requestUrl || '').split('?')[0];

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch (err) {
    return { ok: false, statusCode: 400, message: 'Bad Request' };
  }

  if (!decodedPath || decodedPath === '/') decodedPath = '/index.html';

  // Normalize Windows separators before resolving the request below the root.
  const urlPath = decodedPath.replace(/\\/g, '/');
  const rootedRequestPath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  const filePath = path.resolve(rootPath, `.${rootedRequestPath}`);
  const relativePath = path.relative(rootPath, filePath);
  const outsideRoot = relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath);

  if (outsideRoot) {
    return { ok: false, statusCode: 403, message: 'Forbidden' };
  }

  return { ok: true, filePath };
}

module.exports = { resolveStaticPath };
