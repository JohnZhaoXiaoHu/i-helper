import { App } from 'electron';
//  应用储存模块
import appStorageModule from './appStorage/appStorage.module';
//  设置模块
import settingModule from './setting/setting.module';
//  快捷键模块
import shortcutKeyModule from './shortcutKey/shortcutKey.module';
//  托盘模块
import trayModule from './tray/tray.module';
//  插件模块
import pluginModule from './plugin/plugin.module';
//  开发者模块
import devModule from './dev/dev.module';
//  窗体模块
import windowModule from './window/window.module';
//  商店模块
import storeModule from './store/store.module';
import pluginService from './plugin/plugin.service';

export default {
  async init(app: App): Promise<void> {
    await Promise.all([
      appStorageModule.init(app),
      settingModule.init(app),
      shortcutKeyModule.init(app),
      trayModule.init(app),
      pluginModule.init(app),
      storeModule.init(app),
      devModule.init(app),
      windowModule.init(app)
    ]);

    //  应用启动时，对我的插件/插件商店的插件安装情况进行初始化
    pluginService.setPluginInstallInfo();
  }
};
