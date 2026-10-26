// -----------------------------------------------------------------------------
// Dashboard widget (Gladys 5.1+): "Life360 circle".
//
// One status row per member (where they are, green at home), live battery
// tiles bound to the members' battery features (they follow the published
// states, nothing to refresh), the time of the last read, and two buttons:
// read Life360 now, and ask every phone for a fresh position.
//
// The content is declarative — the core renders it with its own theme, dark
// mode and translations. Texts are `{ en, fr, de, es }` objects, the budget
// (6 tiles, 1 status list of 10 rows, 4 buttons, 2 texts) is checked in
// test/capabilities.test.js with the SDK's validateWidgetContent.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { placeLabel } from '../life360/member.js';
import { FEATURE, memberIds } from '../devices/member.js';
import { MESSAGES } from '../messages.js';

const logger = createLogger({ name: 'widget' });

// Widget key, as declared in the manifest `widgets` field: never renamed.
export const CIRCLE_WIDGET = 'life360_circle';

export const CIRCLE_ACTIONS = { REFRESH: 'refresh', LOCATE_ALL: 'locate_all' };

const MAX_ROWS = 10;
// 8 components at most: 3 battery tiles + the status list + the caption +
// 2 buttons leaves one spare. The status list covers everyone else.
const MAX_TILES = 3;
const MAX_STATUS_TEXT = 40;
const MAX_TILE_LABEL = 24;

function shorten(text, max) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const AT_HOME = { en: 'At home', fr: 'À la maison', de: 'Zuhause', es: 'En casa' };
const NO_POSITION = {
  en: 'No position',
  fr: 'Pas de position',
  de: 'Kein Standort',
  es: 'Sin posición',
};
const DRIVING = { en: 'driving', fr: 'en route', de: 'unterwegs', es: 'conduciendo' };

/** One status row: where the member is, colored by what it means. */
function memberRow({ member, status }) {
  const location = member.location;
  if (!location) {
    return {
      label: shorten(member.name, MAX_STATUS_TEXT),
      icon: 'user-x',
      value: NO_POSITION,
      color: WIDGET_COLORS.WARNING,
    };
  }
  const where = status.atHome
    ? AT_HOME
    : localize((language) => {
        const place = placeLabel(member);
        const suffix = location.driving ? ` (${pick(language, DRIVING)})` : '';
        return shorten(`${place}${suffix}`, MAX_STATUS_TEXT);
      });
  return {
    label: shorten(member.name, MAX_STATUS_TEXT),
    icon: location.driving ? 'navigation' : status.atHome ? 'home' : 'map-pin',
    value: where,
    color: status.atHome
      ? WIDGET_COLORS.SUCCESS
      : location.place
        ? WIDGET_COLORS.INFO
        : WIDGET_COLORS.NEUTRAL,
  };
}

function lastReadText(service) {
  if (service.lastError) {
    return {
      type: 'text',
      variant: 'caption',
      text: {
        en: 'Life360 unreachable, positions may be outdated.',
        fr: 'Life360 injoignable, positions peut-être anciennes.',
        de: 'Life360 nicht erreichbar, Standorte evtl. veraltet.',
        es: 'Life360 inaccesible, posiciones quizá antiguas.',
      },
    };
  }
  if (!service.lastRefreshAt) {
    return {
      type: 'text',
      variant: 'caption',
      text: {
        en: 'Waiting for the first Life360 read.',
        fr: 'En attente de la première lecture Life360.',
        de: 'Warte auf die erste Life360-Abfrage.',
        es: 'Esperando la primera lectura de Life360.',
      },
    };
  }
  const time = service.lastRefreshAt.slice(11, 16);
  return {
    type: 'text',
    variant: 'caption',
    text: {
      en: `Read at ${time} UTC`,
      fr: `Lu à ${time} UTC`,
      de: `Gelesen um ${time} UTC`,
      es: `Leído a las ${time} UTC`,
    },
  };
}

/** The widget content, from the service's last read. */
export function buildCircleContent(gladys, service) {
  const entries = [...service.entries.values()];
  const components = [];

  for (const { member } of entries.slice(0, MAX_TILES)) {
    components.push({
      type: 'value',
      label: shorten(member.name, MAX_TILE_LABEL),
      icon: 'battery',
      device_feature: memberIds(gladys, member.id).feature(FEATURE.BATTERY),
    });
  }

  if (entries.length > 0) {
    components.push({ type: 'status', items: entries.slice(0, MAX_ROWS).map(memberRow) });
  } else {
    components.push({
      type: 'text',
      variant: 'body',
      text: {
        en: 'No Life360 member yet: check the configuration of the integration.',
        fr: 'Aucun membre Life360 pour l’instant : vérifiez la configuration de l’intégration.',
        de: 'Noch kein Life360-Mitglied: Prüfe die Konfiguration der Integration.',
        es: 'Aún no hay miembros de Life360: revise la configuración de la integración.',
      },
    });
  }

  components.push(lastReadText(service));

  components.push({
    type: 'button',
    label: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: CIRCLE_ACTIONS.REFRESH },
  });
  if (entries.length > 0) {
    components.push({
      type: 'button',
      label: {
        en: 'Locate everyone',
        fr: 'Localiser tout le monde',
        de: 'Alle orten',
        es: 'Localizar a todos',
      },
      icon: 'crosshair',
      style: 'primary',
      // Each phone gets a request: ask before sending.
      action: { key: CIRCLE_ACTIONS.LOCATE_ALL, confirm: true },
    });
  }

  return {
    // The rows change with every refresh, which nudges the widget (see
    // index.js): the TTL is only a safety net.
    ttl_seconds: Math.max(60, service.config?.refresh_interval ?? 60),
    components,
  };
}

export const WIDGETS = {
  [CIRCLE_WIDGET]: {
    async get(gladys, { service }) {
      logger.debug(`onWidgetGet <- ${CIRCLE_WIDGET}`);
      return buildCircleContent(gladys, service);
    },

    async action(gladys, { actionKey, service }) {
      logger.info(`onWidgetAction <- ${CIRCLE_WIDGET}.${actionKey}`);
      if (actionKey === CIRCLE_ACTIONS.REFRESH) {
        await service.refresh();
        if (service.lastError) throw new Error(service.lastError.message);
        return MESSAGES.refreshed;
      }
      if (actionKey === CIRCLE_ACTIONS.LOCATE_ALL) {
        await service.requestAllLocationUpdates();
        return MESSAGES.locationRequested;
      }
      // Throwing acks the action as failed: the message reaches the user.
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};

/** Ask the core to re-pull every widget now (rate-limited 1 per 10 s core-side). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
