/*
 * @Description: 自动签到脚本
 * @Author: zhengfei.tan
 * @Date: 2025-06-02 23:21:07
 * @FilePath: \qiandao\index.js
 */

const https = require('https')

// 配置管理
class Config {
  static BASE = {
    hostname: 'api-bj.wenxiaobai.com',
    timeout: 10000, // 请求超时时间：10秒
    maxRetries: 3, // 请求失败最大重试次数
    retryDelay: 1000, // 请求失败重试间隔：1秒
    activityDelay: 8000, // 活动执行间隔：8秒
    maxAttempts: 15, // 活动最大执行次数
  }

  static TASKS = {
    SIGN_IN: '5f2722e2668b3b6de7c14d495e3cbb51',
    ACTIVITIES: [
      {
        taskName: '浏览游戏广告',
        taskId: '49986ea4f9f6420bc6db9e0c58eb8819',
      },
      {
        taskName: '浏览商品广告',
        taskId: 'fdae379cb3b3a19d6b654625f0747801',
      },
      {
        taskName: '浏览视频广告',
        taskId: 'd5bc74ea7d8590d5cff7921e2885edf3',
      },
      {
        taskName: '浏览普通广告',
        taskId: '1a73ab0327754bb83e3ea0edc5aa834a',
      },
      {
        taskName: '隐藏广告',
        taskId: 'f8fc47359795fe39535ead4bca48d175',
      },
    ],
  }
}

// 工具类
class Utils {
  static formatTime() {
    return new Date().toISOString().replace('T', ' ').substr(0, 19)
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  static log(message, type = 'info') {
    const time = this.formatTime()
    const prefix = type === 'error' ? '错误' : '信息'
    console[type](`[${time}] ${prefix}: ${message}`)
  }
}

// HTTP请求类
class HttpClient {
  static async request(options) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, res => {
        let data = ''

        res.on('data', chunk => (data += chunk))

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data || '{}'))
            } catch (error) {
              reject(new Error(`解析响应数据失败：${error.message}`))
            }
          } else {
            reject(new Error(`请求失败，状态码：${res.statusCode}，返回：${data}`))
          }
        })
      })

      req.on('error', error => {
        reject(new Error(`网络请求失败：${error.message}`))
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('请求超时'))
      })

      req.end()
    })
  }

  static createOptions(token, taskId) {
    return {
      hostname: Config.BASE.hostname,
      path: `/rest/api/task/trigger?taskId=${taskId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-yuanshi-authorization': `Bearer ${token}`,
        'x-yuanshi-appname': 'wanyu',
      },
      timeout: Config.BASE.timeout,
    }
  }
}

// 活动执行类
class ActivityExecutor {
  constructor(token) {
    this.token = token
  }

  async executeActivity(taskId, taskName, retryCount = 0) {
    try {
      const options = HttpClient.createOptions(this.token, taskId)
      const result = await HttpClient.request(options)

      if (!result.msg) {
        throw new Error('响应数据格式错误')
      }

      Utils.log(`${taskName || '活动'}执行结果：${result.msg}`)

      if (result.msg === 'SUCCESS') {
        if (retryCount >= Config.BASE.maxAttempts) {
          throw new Error(`已达到最大执行次数 ${Config.BASE.maxAttempts}`)
        }
        await Utils.sleep(Config.BASE.activityDelay)
        return this.executeActivity(taskId, taskName, retryCount + 1)
      }

      if (result.msg.includes('maximum')) {
        return result
      }

      throw new Error(`活动执行失败：${result.msg}`)
    } catch (error) {
      if (retryCount < Config.BASE.maxRetries) {
        Utils.log(`${error.message}，${Config.BASE.retryDelay / 1000}秒后重试...`)
        await Utils.sleep(Config.BASE.retryDelay)
        return this.executeActivity(taskId, taskName, retryCount + 1)
      }
      throw error
    }
  }

  async executeSignIn() {
    const options = HttpClient.createOptions(this.token, Config.TASKS.SIGN_IN)
    const result = await HttpClient.request(options)

    if (result.msg === 'SUCCESS') {
      Utils.log('签到成功！')
      ActivityExecutor.signInFlag = true
    } else if (result.msg.includes('今日已签到')) {
      Utils.log('今日已签到！')
      ActivityExecutor.signInFlag = true
    }

    return result
  }

  async executeAllActivities() {
    for (const activity of Config.TASKS.ACTIVITIES) {
      Utils.log(`开始执行${activity.taskName}活动...`)
      try {
        await this.executeActivity(activity.taskId, activity.taskName)
      } catch (error) {
        Utils.log(error.message, 'error')
      }
    }
  }
}

// 主程序
async function main() {
  try {
    if (!process.env.AUTH_TOKEN) {
      throw new Error('缺少认证令牌，请设置AUTH_TOKEN环境变量')
    }

    const tokens = process.env.AUTH_TOKEN.includes(';')
      ? process.env.AUTH_TOKEN.split(';')
      : [process.env.AUTH_TOKEN]

    Utils.log('开始执行签到任务...')

    for (const token of tokens) {
      const executor = new ActivityExecutor(token)
      try {
        await executor.executeSignIn()
        await executor.executeAllActivities()
      } catch (error) {
        Utils.log(error.message, 'error')
      }
    }

    Utils.log('所有任务执行完成！')
  } catch (error) {
    Utils.log(error.message, 'error')
    process.exit(1)
  }
}

main()
