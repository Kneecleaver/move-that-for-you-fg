const MODULE_ID = 'move-that-for-you';

Hooks.once('init', () => {
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

        console.log(document);

        if (document.flags?.[MODULE_ID]?.allowPlayerRotate) {
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
  // Create the controls
  const playerMoveControl = $(`
<div class="control-icon " data-action="playerMove">
  <div>
    <i title="${game.i18n.format(
      'move-that-for-you.control-title'
    )}" class="fas fa-people-carry"></i>
    <i class="allowRotate fas fa-sync fa-2xs"></i>
  </div>
</div>
`);
  const rotateControl = playerMoveControl.find('.allowRotate');
  form.find('div.col.right').last().append(playerMoveControl);

  const doc = hud.object.document;

  // Pre-active the controls if need be
  if (doc.getFlag(MODULE_ID, 'allowPlayerMove')) {
    playerMoveControl.addClass('active');
    if (doc.getFlag(MODULE_ID, 'allowPlayerRotate')) {
      rotateControl.addClass('active');
    }
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

    if (!playerMoveControl.hasClass('active')) playerMoveControl.click();
  });
});
