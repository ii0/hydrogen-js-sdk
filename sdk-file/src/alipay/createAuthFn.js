const constants = require('core-module/constants')
const HError = require('core-module/HError')
const AUTH_ERROR = 11

/**
 * 通过 forceLogin 判断是否为强制登录
 * scope 为 'auth_user'时，是主动授权，会弹出授权窗口
 * scope 为 'auth_base'时，不会弹出授权窗口
 *
 * 当有 userId 时，执行 linkAlipay 的操作
 */
const createAuthFn = BaaS => function auth(forceLogin, userId) {
  const scope = forceLogin ? 'auth_user' : 'auth_base'
  const handler = !userId
    ? createLoginHandlerFn(BaaS)
    : createUserAssociateFn(BaaS)
  return new Promise((resolve, reject) => {
    my.getAuthCode({
      scopes: scope,
      success: res => {
        if (res.authCode) {
          resolve(res.authCode)
        } else {
          reject(res.authErrorScope)
        }
      },
      fail: res => reject(res),
    })
  })
    .catch(err => {
      // 当用户取消授权后，执行静默登录
      if ((err.error && err.error === AUTH_ERROR)
        // 兼容开发工具上用户取消授权的操作
        || (err.authErrorScope && err.authErrorScope.scope)) {
        return auth(false, userId)
      } else {
        throw err
      }
    })
    .then(code => handler(code, forceLogin))
}

const createLoginHandlerFn = BaaS => (code, forceLogin) => {
  const API = BaaS._config.API
  const url = forceLogin ? API.ALIPAY.AUTHENTICATE : API.ALIPAY.SILENT_LOGIN
  return BaaS.request({
    url,
    method: 'POST',
    data: { code },
  }).then(res => {
    if (res.status == constants.STATUS_CODE.CREATED) {
      BaaS.storage.set(constants.STORAGE_KEY.UID, res.data.user_id)
      BaaS.storage.set(constants.STORAGE_KEY.ALIPAY_USER_ID, res.data.alipay_user_id || '')
      BaaS.storage.set(constants.STORAGE_KEY.AUTH_TOKEN, res.data.token)
      BaaS.storage.set(constants.STORAGE_KEY.EXPIRES_AT, Math.floor(Date.now() / 1000) + res.data.expires_in - 30)
      return res
    } else {
      throw new HError(res.statusCode, require('./request').extractErrorMsg(res))
    }
  })
}

const createUserAssociateFn = BaaS => (code, forceLogin) => {
  const API = BaaS._config.API
  return BaaS.request({
    url: API.ALIPAY.USER_ASSOCIATE,
    method: 'PUT',
    data: { code, authorized: forceLogin },
  }).then(res => {
    if (res.status == constants.STATUS_CODE.UPDATE) {
      BaaS.storage.set(constants.STORAGE_KEY.ALIPAY_USER_ID, res.data.alipay_user_id || '')
      return res
    } else {
      throw new HError(res.statusCode, require('./request').extractErrorMsg(res))
    }
  })
}

module.exports = createAuthFn