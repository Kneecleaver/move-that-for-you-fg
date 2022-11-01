const MODULE_ID = 'move-that-for-you';

Hooks.once('init', () => {
  // Register settings

  game.settings.register(MODULE_ID, 'allowRotation', {
    name: game.i18n.format(`${MODULE_ID}.settings.allow-rotation.name`),
    hint: game.i18n.format(`${MODULE_ID}.settings.allow-rotation.hint`),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  // Register socket to forward player updates to GMs
  game.socket?.on(`module.${MODULE_ID}`, (message) => {
    if (game.user.isGM && message.handlerName === 'tile' && message.type === 'UPDATE') {
      const isResponsibleGM = !game.users
        .filter((user) => user.isGM && (user.active || user.isActive))
        .some((other) => other.id < game.user.id);
      if (!isResponsibleGM) return;
      canvas.scene.updateEmbeddedDocuments('Tile', [message.args.data], message.args.options);
    }
  });

  // Libwrap tile control methods for players
  ['_canDrag', '_canHover', '_canControl'].forEach((method) => {
    libWrapper.register(
      MODULE_ID,
      `Tile.prototype.${method}`,
      function (wrapped, ...args) {
        let result = wrapped(...args);
        if (game.user.isGM) return result;
        return !game.paused && this.document.getFlag(MODULE_ID, 'allowPlayerMove');
      },
      'WRAPPER'
    );
  });

  libWrapper.register(
    MODULE_ID,
    `Tile.prototype._canHUD`,
    function (wrapped, ...args) {
      let result = wrapped(...args);
      if (game.user.isGM) return result;
      return false;
    },
    'WRAPPER'
  );
});

Hooks.on('getSceneControlButtons', (controls) => {
  if (game.user.isGM) return;

  for (let i = 0; i < controls.length; i++) {
    if (controls[i].name === 'tiles') {
      controls[i].visible = true;

      // Remove core tools, only keeping "select";
      const tools = [];
      const coreTools = ['tile', 'browse', 'foreground'];
      controls[i].tools.forEach((t) => {
        if (!coreTools.includes(t.name)) {
          tools.push(t);
        }
      });

      controls[i].tools = tools;

      return;
    }
  }
});

Hooks.once('canvasReady', () => {
  if (!game.user.isGM) {
    Hooks.on('preUpdateTile', (document, data, options, userId) => {
      if (game.user.id === userId) {
        // Only allow positional updates
        let keyNum = Object.keys(data).length;
        if ('x' in data) keyNum--;
        if ('y' in data) keyNum--;

        if (game.settings.get(MODULE_ID, 'allowRotation')) {
          if ('rotation' in data) keyNum--;
        }

        if (keyNum === 1) {
          const message = {
            handlerName: 'tile',
            args: { document, data, options },
            type: 'UPDATE',
          };
          game.socket?.emit(`module.${MODULE_ID}`, message);
          return false;
        }
      }
    });
  }
});

Hooks.on('renderTileHUD', (hud, form, options) => {
  const playerMoveControl = $(`
  <div class="control-icon " data-action="playerMove">
    <i title="${game.i18n.format(
      'move-that-for-you.control-title'
    )}" class="fas fa-people-carry"></i>
  </div>`);
  form.find('div.col.right').last().append(playerMoveControl);

  const doc = hud.object.document;

  if (doc.getFlag(MODULE_ID, 'allowPlayerMove')) {
    playerMoveControl.addClass('active');
  }

  playerMoveControl.click(async () => {
    if (playerMoveControl.hasClass('active')) {
      await doc.unsetFlag(MODULE_ID, 'allowPlayerMove');
      playerMoveControl.removeClass('active');
    } else {
      doc.setFlag(MODULE_ID, 'allowPlayerMove', true);
      playerMoveControl.addClass('active');
    }
  });
});
