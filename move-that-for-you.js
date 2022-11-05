import TileBoundConfig from './app/tileBoundConfig.js';

const MODULE_ID = 'move-that-for-you';

Hooks.once('init', () => {
  // Register socket to forward player updates to GMs
  game.socket?.on(`module.${MODULE_ID}`, (message) => {
    if (game.user.isGM && message.handlerName === 'tile' && message.type === 'UPDATE') {
      const isResponsibleGM = !game.users
        .filter((user) => user.isGM && (user.active || user.isActive))
        .some((other) => other.id < game.user.id);
      if (!isResponsibleGM) return;
      const scene = game.collections.get('Scene').get(message.args.sceneId);
      scene.updateEmbeddedDocuments('Tile', [message.args.data], message.args.options);
    }
  });

  // Register settings
  game.settings.registerMenu(MODULE_ID, 'configureBounds', {
    name: game.i18n.format(`${MODULE_ID}.settings.configure-bounds.name`),
    hint: game.i18n.format(`${MODULE_ID}.settings.configure-bounds.hint`),
    label: '',
    scope: 'world',
    icon: 'fas fa-cog',
    type: TileBoundConfig,
    restricted: true,
  });

  game.settings.register(MODULE_ID, 'fitInBounds', {
    name: game.i18n.localize(`${MODULE_ID}.settings.fit-in-bounds.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.fit-in-bounds.hint`),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  // Register keybindings
  game.keybindings.register(MODULE_ID, 'configureBoundsKey', {
    name: game.i18n.localize(`${MODULE_ID}.settings.configure-bounds-key.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.configure-bounds-key.hint`),
    editable: [
      {
        key: 'KeyB',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      new TileBoundConfig().render(true);
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
});

function flagControlledPermissions() {
  return (
    !game.paused &&
    (this.document.getFlag(MODULE_ID, 'allowPlayerMove') ||
      this.document.getFlag(MODULE_ID, 'allowPlayerRotate'))
  );
}

function flagControlledDragPermission() {
  return !game.paused && this.document.getFlag(MODULE_ID, 'allowPlayerMove');
}

/*
 * Since game.user is not initialized on init Hook we cannot libWrap permission functions just for players
 * before references to them are stored in MouseInteractionManager
 * As a workaround let the canvas load, modify permission functions for existing tiles, and then libWrap them
 */

Hooks.once('canvasReady', () => {
  if (game.user.isGM) return;

  canvas.tiles.placeables.forEach((tile) => {
    const permissions = tile.mouseInteractionManager?.permissions;
    if (permissions) {
      // Enable hover, control, and dragging
      ['hoverIn', 'hoverOut', 'clickLeft'].forEach((fn) => {
        permissions[fn] = flagControlledPermissions.bind(tile);
      });

      // Drag only enabled if allowPlayerMove flag is set
      permissions['dragStart'] = flagControlledDragPermission.bind(tile);

      // HUD always disabled
      permissions['clickRight'] = () => false;
    }
  });

  // Libwrap tile control methods for players
  ['_canHover', '_canControl'].forEach((method) => {
    libWrapper.register(
      MODULE_ID,
      `Tile.prototype.${method}`,
      function (...args) {
        return flagControlledPermissions.call(this);
      },
      'OVERRIDE'
    );
  });

  libWrapper.register(
    MODULE_ID,
    `Tile.prototype._canDrag`,
    function (...args) {
      return flagControlledDragPermission.call(this);
    },
    'OVERRIDE'
  );

  // Disable Tile HUD for players
  libWrapper.register(
    MODULE_ID,
    `Tile.prototype._canHUD`,
    function (...args) {
      return false;
    },
    'OVERRIDE'
  );

  // Hook onto tile updates. We want to pass these on to the GM if the players have been
  // given permission to update tile position and/or rotation
  Hooks.on('preUpdateTile', (document, data, options, userId) => {
    if (game.user.id === userId) {
      // Only allow positional updates
      let keyNum = Object.keys(data).length;

      if (document.flags?.[MODULE_ID]?.allowPlayerMove) {
        if ('x' in data) keyNum--;
        if ('y' in data) keyNum--;
      }

      if (document.flags?.[MODULE_ID]?.allowPlayerRotate) {
        if ('rotation' in data) keyNum--;
      }

      if (keyNum === 1) {
        // If it's a position update we need to check if it's within the defined bounds for this scene
        let boundCheckPassed = false;
        if ('x' in data || 'y' in data) {
          const canvasBounds = canvas.scene.getFlag(MODULE_ID, 'bounds') || [];
          if (canvasBounds.length) {
            const x = 'x' in data ? data.x : document.x;
            const y = 'y' in data ? data.y : document.y;
            const width = document.width;
            const height = document.height;

            const fitInBounds = game.settings.get(MODULE_ID, 'fitInBounds');

            canvasBounds.forEach((b) => {
              if (fitInBounds) {
                if (
                  x >= b.x1 &&
                  x <= b.x2 &&
                  y >= b.y1 &&
                  y <= b.y2 &&
                  x + width <= b.x2 &&
                  y + height <= b.y2
                ) {
                  boundCheckPassed = true;
                }
              } else {
                if (x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2) {
                  boundCheckPassed = true;
                }
              }
            });
          } else {
            boundCheckPassed = true;
          }
        } else {
          boundCheckPassed = true;
        }

        if (boundCheckPassed) {
          const message = {
            handlerName: 'tile',
            args: { document, data, options, sceneId: canvas.scene.id },
            type: 'UPDATE',
          };
          game.socket?.emit(`module.${MODULE_ID}`, message);
        }
        return false;
      } else if ('rotation' in data && Object.keys(data).length === 2) {
        return false;
      }
    }
  });
});

// Hide core tile tools for players, only keeping "select";
Hooks.on('getSceneControlButtons', (controls) => {
  if (game.user.isGM) return;

  for (let i = 0; i < controls.length; i++) {
    if (controls[i].name === 'tiles') {
      controls[i].visible = true;

      const coreTools = ['tile', 'browse', 'foreground'];
      controls[i].tools.forEach((t) => {
        if (coreTools.includes(t.name)) {
          t.visible = false;
        }
      });

      return;
    }
  }
});

// Add additional controls to the Tile HUD for GMs
Hooks.on('renderTileHUD', (hud, form, options) => {
  // Create the controls
  const playerMoveControl = $(`
<div class="control-icon " data-action="playerMove">
  <div>
    <i title="${game.i18n.format(
      'move-that-for-you.control-title'
    )}" class="fas fa-people-carry"></i>
    <i class="allowRotate fas fa-sync fa-lg"></i>
  </div>
</div>
`);
  const rotateControl = playerMoveControl.find('.allowRotate');
  form.find('div.col.right').last().append(playerMoveControl);

  const doc = hud.object.document;

  // Pre-active the controls if need be
  if (doc.getFlag(MODULE_ID, 'allowPlayerMove')) {
    playerMoveControl.addClass('active');
  }

  if (doc.getFlag(MODULE_ID, 'allowPlayerRotate')) {
    rotateControl.addClass('active');
  }

  // Register listeners
  playerMoveControl.click(async () => {
    if (playerMoveControl.hasClass('active')) {
      await doc.unsetFlag(MODULE_ID, 'allowPlayerMove');
      playerMoveControl.removeClass('active');
    } else {
      doc.setFlag(MODULE_ID, 'allowPlayerMove', true);
      playerMoveControl.addClass('active');
    }
  });
  playerMoveControl.contextmenu(async () => {
    if (rotateControl.hasClass('active')) {
      await doc.unsetFlag(MODULE_ID, 'allowPlayerRotate');
      rotateControl.removeClass('active');
    } else {
      doc.setFlag(MODULE_ID, 'allowPlayerRotate', true);
      rotateControl.addClass('active');
    }
  });
});

/*
 * If Mass Edit is active, add checkboxes to the config forms
 */

Hooks.once('ready', () => {
  if (!game.user.isGM || !game.modules.get('multi-token-edit')?.active) return;
  Hooks.on('renderTileConfig', (app, html, data) => {
    const isInjected = html.find(`input[name="flags.${MODULE_ID}.allowPlayerMove"]`).length > 0;
    if (isInjected) return;

    const allowMove = app.object.getFlag(MODULE_ID, 'allowPlayerMove');
    const allowRotate = app.object.getFlag(MODULE_ID, 'allowPlayerRotate');

    const newHtml = `
  <div class="form-group">
    <label>${game.i18n.localize(`${MODULE_ID}.tile-config.move.label`)}</label>
    <div class="form-fields">
        <input type="checkbox" name="flags.${MODULE_ID}.allowPlayerMove" ${
      allowMove ? 'checked' : ''
    }>
    </div>
    <p class="notes">${game.i18n.localize(`${MODULE_ID}.tile-config.move.note`)}</p>
  </div>

  <div class="form-group">
    <label>${game.i18n.localize(`${MODULE_ID}.tile-config.rotate.label`)}</label>
    <div class="form-fields">
        <input type="checkbox" name="flags.${MODULE_ID}.allowPlayerRotate" ${
      allowRotate ? 'checked' : ''
    }>
    </div>
    <p class="notes">${game.i18n.localize(`${MODULE_ID}.tile-config.rotate.note`)}</p>
  </div>
`;

    html.find(`input[name="texture.tint"]`).closest('.form-group').after(newHtml);
    app.setPosition({ height: 'auto' });
  });
});
