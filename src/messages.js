// -----------------------------------------------------------------------------
// User-facing messages: connection status, action answers, badge tooltips.
// Every one is a `{ en, fr, de, es }` object (see src/i18n.js).
// -----------------------------------------------------------------------------

import { localize, pick } from './i18n.js';
import { AUTH_METHODS } from './config.js';

export const MESSAGES = {
  notConfigured: {
    en: 'Not configured yet: paste your Life360 access token, or enter your username and password.',
    fr: 'Pas encore configurée : collez votre jeton d’accès Life360, ou saisissez identifiant et mot de passe.',
    de: 'Noch nicht eingerichtet: Füge dein Life360-Zugriffstoken ein oder gib Benutzername und Passwort ein.',
    es: 'Aún sin configurar: pegue su token de acceso de Life360, o introduzca usuario y contraseña.',
  },
  tokenRefused: {
    en: 'Life360 refused the access token (expired or wrong). Copy a new one from life360.com.',
    fr: 'Life360 a refusé le jeton d’accès (expiré ou faux). Copiez-en un nouveau depuis life360.com.',
    de: 'Life360 hat das Zugriffstoken abgelehnt (abgelaufen oder falsch). Kopiere ein neues von life360.com.',
    es: 'Life360 rechazó el token de acceso (caducado o incorrecto). Copie uno nuevo desde life360.com.',
  },
  tokenForbidden: {
    en: 'Life360 does not accept this access token (HTTP 403). Copy the access_token value of the /v3/oauth2/token request again, from life360.com.',
    fr: 'Life360 n’accepte pas ce jeton d’accès (HTTP 403). Recopiez la valeur access_token de la requête /v3/oauth2/token, depuis life360.com.',
    de: 'Life360 akzeptiert dieses Zugriffstoken nicht (HTTP 403). Kopiere den Wert access_token der Anfrage /v3/oauth2/token erneut von life360.com.',
    es: 'Life360 no acepta este token de acceso (HTTP 403). Vuelva a copiar el valor access_token de la petición /v3/oauth2/token, desde life360.com.',
  },
  blocked: {
    en: 'Cloudflare, in front of Life360, blocks the internet address of Gladys for now. The integration slows down and retries; a VPN or proxy often causes it.',
    fr: 'Cloudflare, devant Life360, bloque pour le moment l’adresse internet de Gladys. L’intégration ralentit et réessaie ; un VPN ou un proxy en est souvent la cause.',
    de: 'Cloudflare vor Life360 sperrt gerade die Internetadresse von Gladys. Die Integration wird langsamer und versucht es erneut; oft ist ein VPN oder Proxy die Ursache.',
    es: 'Cloudflare, delante de Life360, bloquea por ahora la dirección de internet de Gladys. La integración va más despacio y lo vuelve a intentar; un VPN o proxy suele ser la causa.',
  },
  passwordRefused: {
    en: 'Life360 refused the sign-in. It often asks for a verification code now: use the access token method instead.',
    fr: 'Life360 a refusé la connexion. Il demande souvent un code de vérification : utilisez plutôt la méthode du jeton d’accès.',
    de: 'Life360 hat die Anmeldung abgelehnt. Oft wird jetzt ein Bestätigungscode verlangt: Nutze stattdessen die Zugriffstoken-Methode.',
    es: 'Life360 rechazó el inicio de sesión. Ahora suele pedir un código de verificación: use mejor el método del token de acceso.',
  },
  rateLimited: {
    en: 'Life360 limits the requests for now: the integration slows down and retries.',
    fr: 'Life360 limite les requêtes pour le moment : l’intégration ralentit et réessaie.',
    de: 'Life360 begrenzt die Anfragen gerade: Die Integration wird langsamer und versucht es erneut.',
    es: 'Life360 limita las peticiones por ahora: la integración va más despacio y lo vuelve a intentar.',
  },
  unreachable: {
    en: 'Life360 cannot be reached. Check the internet connection of Gladys.',
    fr: 'Life360 est injoignable. Vérifiez la connexion internet de Gladys.',
    de: 'Life360 ist nicht erreichbar. Prüfe die Internetverbindung von Gladys.',
    es: 'No se puede contactar con Life360. Compruebe la conexión a internet de Gladys.',
  },
  noCircle: {
    en: 'Connected, but no Life360 circle matches the "Circles to follow" setting.',
    fr: 'Connecté, mais aucun cercle Life360 ne correspond au réglage « Cercles à suivre ».',
    de: 'Verbunden, aber kein Life360-Kreis passt zur Einstellung „Zu folgende Kreise“.',
    es: 'Conectado, pero ningún círculo de Life360 coincide con el ajuste «Círculos a seguir».',
  },
  failed: {
    en: 'Life360 answered with an error, check the integration logs.',
    fr: 'Life360 a répondu par une erreur, consultez les logs de l’intégration.',
    de: 'Life360 hat mit einem Fehler geantwortet, sieh in den Logs der Integration nach.',
    es: 'Life360 respondió con un error, consulte los registros de la integración.',
  },
  notSharing: {
    en: 'This member stopped sharing their location.',
    fr: 'Ce membre ne partage plus sa position.',
    de: 'Dieses Mitglied teilt seinen Standort nicht mehr.',
    es: 'Este miembro dejó de compartir su ubicación.',
  },
  noLocation: {
    en: 'Life360 has no position for this member right now.',
    fr: 'Life360 n’a pas de position pour ce membre en ce moment.',
    de: 'Life360 hat gerade keinen Standort für dieses Mitglied.',
    es: 'Life360 no tiene ahora ninguna posición de este miembro.',
  },
  unknownMember: {
    en: 'This member is no longer in the followed Life360 circles.',
    fr: 'Ce membre n’est plus dans les cercles Life360 suivis.',
    de: 'Dieses Mitglied ist nicht mehr in den verfolgten Life360-Kreisen.',
    es: 'Este miembro ya no está en los círculos de Life360 seguidos.',
  },
  locationRequested: {
    en: 'Position requested: the phone should answer within a minute.',
    fr: 'Position demandée : le téléphone devrait répondre d’ici une minute.',
    de: 'Standort angefordert: Das Telefon sollte innerhalb einer Minute antworten.',
    es: 'Posición solicitada: el teléfono debería responder en un minuto.',
  },
  refreshed: {
    en: 'Life360 positions refreshed.',
    fr: 'Positions Life360 actualisées.',
    de: 'Life360-Standorte aktualisiert.',
    es: 'Posiciones de Life360 actualizadas.',
  },
};

/** The connection status message of a failed Life360 call. */
export function errorMessage(err, config) {
  if (err?.kind === 'invalid') return MESSAGES.notConfigured;
  if (err?.kind === 'blocked') return MESSAGES.blocked;
  if (err?.kind === 'unauthorized' || err?.kind === 'forbidden') {
    if (config.auth_method === AUTH_METHODS.PASSWORD) return MESSAGES.passwordRefused;
    // A wrong or expired Bearer token gets a 401; a 403 means Life360 does
    // not take that kind of token at all (most likely another value copied).
    return err.kind === 'forbidden' ? MESSAGES.tokenForbidden : MESSAGES.tokenRefused;
  }
  if (err?.kind === 'rate_limited') return MESSAGES.rateLimited;
  if (err?.kind === 'network') return MESSAGES.unreachable;
  return MESSAGES.failed;
}

/**
 * Answer of the "Test the connection" action: the circles followed and who
 * is in them, or why it failed.
 *
 * @param {{ circles: Array<{ name: string }>, members: Array<{ name: string, location: object|null }>, home: object|null }} report
 */
export function connectionReport({ circles, members, home }) {
  return localize((language) => {
    const circleNames = circles.map((circle) => circle.name).join(', ');
    const located = members.filter((member) => member.location).length;
    const homeText = home
      ? pick(language, {
          en: `Home: ${home.name}.`,
          fr: `Domicile : ${home.name}.`,
          de: `Zuhause: ${home.name}.`,
          es: `Casa: ${home.name}.`,
        })
      : pick(language, {
          en: 'No Gladys house with coordinates: only the home place name is used.',
          fr: 'Aucune maison Gladys avec coordonnées : seul le nom du lieu « domicile » est utilisé.',
          de: 'Kein Gladys-Haus mit Koordinaten: Nur der Ortsname für Zuhause wird verwendet.',
          es: 'Ninguna casa de Gladys con coordenadas: solo se usa el nombre del lugar de casa.',
        });
    return pick(language, {
      en: `Connected. Circles: ${circleNames}. ${members.length} member(s), ${located} with a position. ${homeText}`,
      fr: `Connecté. Cercles : ${circleNames}. ${members.length} membre(s), ${located} avec une position. ${homeText}`,
      de: `Verbunden. Kreise: ${circleNames}. ${members.length} Mitglied(er), ${located} mit Standort. ${homeText}`,
      es: `Conectado. Círculos: ${circleNames}. ${members.length} miembro(s), ${located} con posición. ${homeText}`,
    });
  });
}
