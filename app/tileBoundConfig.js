export default class TileBoundConfig extends FormApplication {
  constructor() {
    super({}, {});
    if (!canvas.scene) {
      throw game.i18n.localize(`move-that-for-you.errors.no-scene`);
    }
    this.scene = canvas.scene;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'move-that-for-you-bound-config',
      classes: ['sheet'],
      template: 'modules/move-that-for-you/templates/tileBoundConfig.html',
      resizable: false,
      minimizable: false,
      title: 'Tile Bound Config',
      width: 350,
    });
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('.pick').click(this._onPickBounds.bind(this));
    html.find('.clear').click(this._onClearBounds.bind(this));
  }

  _onClearBounds() {
    if (canvas?.id) {
      this.scene.unsetFlag('move-that-for-you', 'bounds');
      ui.notifications.info(
        game.i18n.format(`move-that-for-you.info.cleared-bounds`, { id: this.scene.id })
      );
    }
  }

  _onPickBounds(event) {
    let settingsConfig;
    Object.values(ui.windows).forEach((app) => {
      if (app instanceof SettingsConfig) {
        settingsConfig = app;
      }
    });

    if (settingsConfig) settingsConfig.minimize();
    this.minimize();

    const configApp = this;

    canvas.stage.addChild(getPickerOverlay()).once('pick', (position) => {
      const minX = Math.floor(Math.min(position.start.x, position.end.x));
      const maxX = Math.floor(Math.max(position.start.x, position.end.x));
      const minY = Math.floor(Math.min(position.start.y, position.end.y));
      const maxY = Math.floor(Math.max(position.start.y, position.end.y));

      const canvasBounds = configApp.scene.getFlag('multi-token-edit', 'bounds') ?? [];

      canvasBounds.push({
        x1: minX,
        y1: minY,
        x2: maxX,
        y2: maxY,
      });

      configApp.scene.setFlag('move-that-for-you', 'bounds', canvasBounds);

      ui.notifications.info(
        game.i18n.format(`move-that-for-you.info.new-bounds`, {
          id: configApp.scene.id,
          bounds: `(x:${minX}, y:${minY}) (x:${maxX}, y:${maxY})`,
        })
      );

      if (settingsConfig) settingsConfig.maximize();
      configApp.maximize();
    });
  }
}

let pickerOverlay;
let boundStart;
let boundEnd;

function getPickerOverlay() {
  if (pickerOverlay) {
    pickerOverlay.destroy(true);
  }

  pickerOverlay = new PIXI.Container();
  pickerOverlay.hitArea = canvas.dimensions.rect;
  pickerOverlay.cursor = 'crosshair';
  pickerOverlay.interactive = true;
  pickerOverlay.zIndex = Infinity;
  pickerOverlay.on('remove', () => pickerOverlay.off('pick'));
  pickerOverlay.on('mousedown', (event) => {
    boundStart = event.data.getLocalPosition(pickerOverlay);
  });
  pickerOverlay.on('mouseup', (event) => (boundEnd = event.data.getLocalPosition(pickerOverlay)));
  pickerOverlay.on('click', (event) => {
    pickerOverlay.emit('pick', { start: boundStart, end: boundEnd });
    pickerOverlay.parent.removeChild(pickerOverlay);
  });
  return pickerOverlay;
}
