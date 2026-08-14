export default defineNuxtRouteMiddleware(async (to) => {
  const { user, load } = useAuth()

  try {
    await load()
  }
  catch (error) {
    if (import.meta.server)
      throw createError({ statusCode: 503, statusMessage: '暂时无法连接管理服务', cause: error })
    if (to.path !== '/login')
      return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  if (to.path === '/login') {
    if (user.value)
      return navigateTo(safeRedirectPath(to.query.redirect))
    return
  }

  if (!user.value)
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
})
