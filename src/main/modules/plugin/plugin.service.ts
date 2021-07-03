import compressing from 'compressing';
import path from 'path';

import pluginDB from '@/main/dataBase/plugin.db';

import * as utils from '@/render/utils';
import * as fsUtils from '@/main/utils/fs';
import * as pluginUtils from '@/main/utils/plugin';

import storeService from '../store/store.service';
import windowService from '../window/window.service';

import clipboardObserver from '@/main/utils/clipboardObserver';

import * as pluginAPI from '@/main/api/plugin';
import { pluginConfigKey } from '@/main/constants/plugin';
import { PluginItem } from '../window/types';

import * as pluginApiService from './services/plugin-api.service';
import * as pluginWinService from './services/plugin-win.service';

/**
 * 项目内创建文件夹说明：
 * publishZips 发布时，插件的压缩包存放的文件夹
 * pluginPackages 插件安装后，插件文件夹存放的文件夹
 * pluginZips 插件安装后，插件压缩包存放的文件夹
 *
 * 插件部分自定义字段说明：
 * isDownload 是否已下载
 * canUpdate 允许更新
 * publishVerson dev中独有，已发布的版本号
 */

class PluginService {
  //  插件列表
  pluginList: Array<any> = [];

  //  剪贴板观察者
  clipboardObserver = null;
  //  剪贴板插件注册集合
  clipboardPluginMap = {};

  async appOnReady(app) {
    await this.getPluginList();

    app.on('web-contents-created', (event, contents) => {
      contents.on('will-attach-webview', (event, webPreferences, params) => {
        params;
        webPreferences;
        contents;
        debugger;
      });
    });
  }

  /**
   * 从服务器中获取插件信息
   * @param id
   */
  async getPluginFromServer(id: string) {
    return await pluginAPI.getPlugin(id);
  }

  /**
   * 获取插件列表
   * @returns
   */
  async getPluginList() {
    const pluginList = await pluginDB.find();
    this.pluginList = pluginList;
    return this.pluginList;
  }

  /**
   * 应用启动时，对我的插件/插件商店的插件安装情况进行初始化
   */
  async initPluginInstallInfo() {
    await storeService.getPluginList();

    this.setPluginInstallInfo();
  }

  /**
   * 根据商店的插件信息，来设置本地插件的下载标记信息
   */
  setPluginInstallInfo() {
    const storePluginKeyMap = storeService.storePluginKeyMap;

    for (const id in storePluginKeyMap) {
      const storePlugin = storePluginKeyMap[id];

      const installed = this.pluginList.find(plugin => plugin.id === id);

      if (installed) {
        storePlugin.isDownload = true;

        if (storePlugin.version > installed.version) {
          installed.canUpdate = true;
          storePlugin.canUpdate = true;
        } else {
          installed.canUpdate = false;
          storePlugin.canUpdate = false;
        }
      } else {
        storePlugin.isDownload = false;
      }
    }
  }

  /**
   * 获取插件信息
   * @param id
   * @returns
   */
  getPlugin(id: string) {
    return this.pluginList.find(app => app.id === id);
  }

  /**
   * 删除插件
   * 1. 数据库中移除
   * 2. 内存中移除
   * 3. 删除插件目录
   * 4. 从商店中更新此插件的已下载标记
   * @param id
   */
  async delPlugin(id: string) {
    await pluginDB.remove({ id });
    const plugin = this.getPlugin(id);
    const index = this.pluginList.findIndex(plugin => plugin.id === id);
    this.pluginList.splice(index, 1);

    const folderPath = plugin[pluginConfigKey.FOLDER_PATH];
    fsUtils.delDir(folderPath);

    //  因为删除了插件，需要刷新插件的安装信息
    this.setPluginInstallInfo();
  }

  /**
   * 解压缩插件压缩包
   * @param zipPath
   */
  async uncompressZip(zipPath: string): Promise<string> {
    //  文件夹名称
    const folderName = utils.getLastPath(zipPath).replace('.zip', '');
    //  解压缩后的文件夹路径
    const afterFilePath = path.join(global.rootPath, `pluginPackages\\${folderName}`);
    //  解压缩后的文件夹内的插件配置路径
    const jsonPath = `${afterFilePath}\\${folderName}\\plugin.json`;

    try {
      // 解压缩
      await compressing.zip.uncompress(zipPath, afterFilePath);
    } catch (error) {
      throw new Error(error);
    }

    return jsonPath;
  }

  /**
   * 插件更新
   * @param id
   */
  async updatePlugin(id: string) {
    await this.delPlugin(id);
    await storeService.download(id);
  }

  /**
   * 安装插件
   * @param zipPath
   */
  async installPlugin(zipPath: string) {
    const size = await fsUtils.getFileSize(zipPath);
    //  解压缩
    const jsonPath = await this.uncompressZip(zipPath);

    const { error, file } = await pluginUtils.getPluginInfoByFile(jsonPath);

    if (error) {
      throw new Error(error);
    }

    const id = file.id;

    if (this.pluginList.some(plugin => plugin.id === id)) {
      throw new Error('这个插件已经安装过咯');
    }

    const saveData = {
      ...file,
      sizeFormat: utils.byteConvert(size)
    };

    const result = await pluginDB.insert(saveData);

    this.pluginList.push(result);

    //  因为安装了插件，需要刷新插件的安装信息
    this.setPluginInstallInfo();

    return result;
  }

  /**
   * 监听剪贴板变化
   * @param id
   * @returns
   */
  clipboardWatch(id: string): void {
    this.clipboardPluginMap[id] = true;

    if (this.clipboardObserver) {
      return;
    }

    this.clipboardObserver = clipboardObserver({
      textChange: (value: string) => {
        this.sendClipboardChange('text', value);
      },
      imageChange: (value: string) => {
        this.sendClipboardChange('image', value);
      }
    });
  }

  /**
   * 移除剪贴板监听
   * @param id
   */
  clipboardOff(id: string): void {
    if (!this.clipboardObserver) {
      return;
    }
    delete this.clipboardPluginMap[id];

    if (!Object.keys(this.clipboardObserver).length) {
      this.clipboardObserver.destroy();
      this.clipboardObserver = null;
    }
  }

  /**
   * 发送剪贴板变化回调
   * @param type 类型
   * @param value 内容
   */
  sendClipboardChange(type: string, value: any): void {
    const findPluginItem = (pluginId: string): PluginItem => windowService.findPluginItemByPluginId(pluginId);

    let result: string;
    if (type === 'image') {
      result = value.toDataURL();
    } else {
      result = String(value);
    }

    for (const pluginId in this.clipboardPluginMap) {
      const pluginItem = findPluginItem(pluginId);
      if (!pluginItem) {
        continue;
      }
      const viewItem = windowService.viewWinMap[pluginItem.viewId].viewItem;

      viewItem.webContents.executeJavaScript(
        `window.iHelper.clipboard.__cb__ && window.iHelper.clipboard.__cb__('${type}', '${result}')`
      );
    }
  }

  appApiHandler = pluginApiService.appApiHandler;
  dbApiHandler = pluginApiService.dbApiHandler;
  clipboardApiHandler = pluginApiService.clipboardApiHandler;
  pluginStart = pluginWinService.pluginStart;
}

export default new PluginService();
