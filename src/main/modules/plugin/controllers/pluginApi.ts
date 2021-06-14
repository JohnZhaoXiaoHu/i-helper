import { ipcMain } from 'electron';
//  窗体管理
import windowService from '@/main/modules/window/window.service';
//  窗口配置
import { browserWindowOptions } from '@/main/constants/config/browserWindow';
import {
  //  打开插件窗体
  openPluginWindow
} from './pluginWin';
import DB from '@/main/dataBase/DB';

/**
 * 根据发送窗体id获取插件信息
 * @param id
 * @returns
 */
function getPluginBySenderId(id: number) {
  //  视图所属的插件窗体ID
  const { pluginWinId } = windowService.viewWinMap[id];
  //  插件窗体信息
  const pluginWinItem = windowService.pluginWin[pluginWinId];
  return pluginWinItem;
}

const app = {
  /**
   * 获取窗体信息
   * @param pluginWinItem
   * @returns
   */
  winInfo: pluginWinItem => {
    const { id, pluginId, isDev, fatherId } = pluginWinItem;
    return {
      id,
      pluginId,
      isDev,
      fatherId
    };
  },
  /**
   * 打开插件中创建的插件窗体
   * @param pluginWinItem
   * @param browserViewUrl
   * @param option
   * @returns
   */
  createBrowserWindow: (pluginWinItem, browserViewUrl, option = {}) => {
    const { pluginId, isDev, id } = pluginWinItem;
    //  默认窗体配置
    const defaultOption = browserWindowOptions.plugin;

    //  打开插件中创建的插件窗体
    return openPluginWindow(pluginId, Object.assign(defaultOption, option), isDev, id, browserViewUrl);
  },

  /**
   * 插件窗体间通信
   * @param pluginWinItem
   * @param id
   * @param event
   * @param data
   */
  communication: (pluginWinItem, id, event, data) => {
    const viewWinItem = windowService.viewWinMap[id];

    if (viewWinItem) {
      const dataArg = typeof data === 'object' ? JSON.stringify(data) : data;

      viewWinItem.browserViewItem.webContents.executeJavaScript(`window.iHelper.trigger('${event}', ${dataArg})`);
    }
  }
};

ipcMain.on('plugin-app', (event, method, ...args) => {
  //  插件窗体信息
  const pluginWinItem = getPluginBySenderId(event.sender.id);

  if (app[method]) {
    const result = app[method](pluginWinItem, ...args);
    event.returnValue = result;
  }
});

const dbAPI = {
  //  插件数据库储存对象
  pluginDb: {},
  //  分页查找
  paging(db: DB, query) {
    return db.paging(query);
  },
  //  插入数据
  insert(db: DB, doc) {
    return db.insert(doc);
  },
  //  寻找多个
  find(db: DB, query) {
    return db.find(query);
  },
  //  寻找单个
  findOne(db: DB, query) {
    return db.findOne(query);
  },
  //  寻找并排序
  findAndSort(db: DB, query, sort) {
    return db.findAndSort(query, sort);
  },
  //  移除数据
  remove(db: DB, query, options) {
    return db.remove(query, options);
  },
  //  更新数据
  update(db: DB, query, updateQuery, options) {
    return db.update(query, updateQuery, options);
  }
};

//  插件——数据库
ipcMain.on('plugin-db', async (event, method, ...args) => {
  //  插件窗体信息
  const pluginWinItem = getPluginBySenderId(event.sender.id);

  if (dbAPI[method]) {
    const pluginId = pluginWinItem.pluginId;

    //  判断是否存在该插件的数据库实例
    if (!dbAPI.pluginDb[pluginId]) {
      dbAPI.pluginDb[pluginId] = new DB(pluginId);
    }
    const db = dbAPI.pluginDb[pluginId];

    event.returnValue = await dbAPI[method](db, ...args);
  }
});
