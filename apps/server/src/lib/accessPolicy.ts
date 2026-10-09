export function isRootOperation(method: string, path: string) {
  const writing = !["GET", "HEAD", "OPTIONS"].includes(method);
  const route = path.replace(/^\/api(?=\/)/, "");
  return /^\/(admin|providers|plugins)(\/|$)/.test(route)
    || (writing && /^\/(nodes|tools|skills)\//.test(route))
    || (writing && /^\/ffmpeg\/(download|cancel)/.test(route))
    || (writing && /^\/agents\/(?!a2a\/)/.test(route))
    || /^\/desktop\/(update|updates|plugins|providerFile|devtools)(\/|$)/.test(route);
}
