# Integración Life360 para Gladys Assistant

Esta integración trae a Gladys los miembros de sus círculos de [Life360](https://www.life360.com):
quién está en casa, dónde está cada uno, la batería de su teléfono y su distancia de casa. Por
ejemplo: activar la alarma cuando sale la última persona, subir la calefacción cuando alguien
vuelve a casa o recibir un mensaje cuando una batería está baja.

> Life360 no tiene API pública oficial. La integración usa la API de la app móvil Life360, como
> la integración de Home Assistant. Life360 puede cambiarla sin previo aviso.

## Requisitos

- Gladys Assistant **5.3 o más reciente**.
- Una cuenta de Life360 que pertenezca a los círculos que quiere seguir.
- Idealmente, las coordenadas de su casa en Gladys (**Ajustes → Casas**): sirven para saber quién
  está «en casa» y para calcular la distancia de casa.

## 1. Obtener su token de acceso de Life360

Life360 rechaza ahora a menudo el inicio de sesión con usuario y contraseña (pide un código de
verificación que la integración no puede escribir). La vía fiable: copiar una vez el token de
acceso desde la web de Life360.

1. En un ordenador, abra una ventana de navegación privada y vaya a <https://life360.com/login>.
2. Abra las herramientas de desarrollo (**F12**) y luego la pestaña **Red**. Escriba `token` en
   el filtro.
3. Inicie sesión en Life360 (correo o teléfono, y luego el código que le envía Life360).
4. Haga clic en la petición `token` que aparece (un `POST` a `/v3/oauth2/token`) y luego en la
   pestaña **Respuesta** (o **Vista previa**).
5. Copie el valor de `access_token` (una larga cadena de letras y cifras).

Guarde este token en privado: da acceso a las posiciones de sus círculos. Sigue siendo válido
varias semanas; cuando Life360 lo rechaza, la pantalla de configuración lo indica y usted copia
uno nuevo del mismo modo.

## 2. Configurar la integración

En Gladys, abra **Integraciones → Life360 → Configuración**:

| Campo                          | Qué escribir                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Método de inicio de sesión     | **Token de acceso** (recomendado), o **Usuario y contraseña**.                                               |
| Token de acceso                | El `access_token` copiado arriba. El prefijo `Bearer` es opcional.                                           |
| Usuario / Contraseña           | Solo para el método de usuario y contraseña. Se guarda el token devuelto por Life360, no la contraseña.      |
| Círculos a seguir              | Nombres de los círculos separados por comas, p. ej. `Familia, Abuelos`. Vacío: todos los círculos.           |
| Casa                           | La casa de Gladys que significa «en casa». Vacío: la primera casa con coordenadas.                           |
| Lugar de Life360 para casa     | El nombre de su lugar de Life360 para casa (por defecto `Home`). Vacío: solo las coordenadas.                |
| Radio de casa (m)              | Distancia de la casa que aún cuenta como «en casa» (150 m por defecto).                                      |
| Intervalo de actualización (s) | Cada cuánto se lee Life360 (60 s por defecto, 15 s como mínimo). Life360 limita las peticiones: no baje más. |
| Umbral de batería baja (%)     | Por debajo de este nivel se activa «Batería del teléfono baja» (20 % por defecto).                           |
| Registros detallados           | Registra cada lectura, para diagnosticar un problema. Los tokens y contraseñas nunca se registran.           |

Guarde y pulse **Probar la conexión**: la respuesta lista los círculos, los miembros y la casa
usada como casa.

## 3. Añadir los miembros

Abra la pestaña **Descubrimiento** de la integración: cada miembro de los círculos seguidos
aparece como un dispositivo llamado `<Nombre> <Apellido> (Life360)`. Cree los que quiera. Un
miembro de varios círculos es un único dispositivo.

Cada dispositivo tiene estas funciones:

| Función            | Valores                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| At home            | 1 en casa, 0 fuera.                                                              |
| Phone battery      | Batería del teléfono del miembro, en %.                                          |
| Phone charging     | 1 mientras el teléfono carga.                                                    |
| Distance from home | En km, desde la casa de Gladys (sin valor si la casa no tiene coordenadas).      |
| Speed              | En km/h, 0 parado.                                                               |
| Place              | El lugar de Life360 (Casa, Colegio…), si no la dirección, si no las coordenadas. |

**Cómo se decide «en casa»:** un miembro está en casa cuando su posición está dentro del radio de
casa alrededor de la casa de Gladys, **o** cuando Life360 lo sitúa en el lugar indicado en «Lugar
de Life360 para casa». Se tiene en cuenta la precisión de la posición del teléfono, hasta el
propio radio.

La insignia de cada dispositivo muestra **cloud** cuando Life360 respondió, un punto naranja
cuando Life360 no tiene posición de ese miembro (ubicación compartida desactivada, teléfono mudo)
e **inaccesible** cuando no se pudo contactar con Life360.

## Escenas

### Disparadores

Todos los disparadores pueden filtrarse por un miembro; los de lugares también por un nombre de
lugar. Cada uno da a la escena las variables `member_name`, `place`, `address`, `battery` y
`distance_km`.

| Disparador                | Clave             | Cuándo                                                       |
| ------------------------- | ----------------- | ------------------------------------------------------------ |
| Miembro llegó a casa      | `arrived_home`    | El miembro vuelve a estar en casa.                           |
| Miembro salió de casa     | `left_home`       | El miembro ya no está en casa.                               |
| Miembro llegó a un lugar  | `place_arrived`   | El miembro entró en un lugar de Life360 (colegio, trabajo…). |
| Miembro salió de un lugar | `place_left`      | El miembro salió de un lugar de Life360.                     |
| Miembro empezó a conducir | `driving_started` | Life360 detectó que el miembro está conduciendo.             |
| Batería del teléfono baja | `battery_low`     | El teléfono bajó del umbral y no está cargando.              |

Los disparadores comparan dos lecturas seguidas: reiniciar la integración nunca dispara «llegó a
casa» para todos. La función «At home» también funciona con el disparador estándar **Estado de un
dispositivo**.

### Acciones

| Acción                            | Clave                     | Resultado                                                                                                                                        |
| --------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Localizar a un miembro de Life360 | `request_location_update` | Pide una posición nueva al teléfono del miembro. Salida: `requested`.                                                                            |
| Leer un miembro de Life360        | `get_member_status`       | Salidas `found`, `at_home`, `place`, `distance_km` (-1 desconocida), `battery` (-1 desconocida), `charging`, `driving`, `last_seen` (fecha ISO). |

## Widget del panel

Añada el widget **Círculo Life360** a un panel: mosaicos de batería de los primeros miembros, una
línea por miembro (en verde en casa), la hora de la última lectura, un botón **Actualizar** y un
botón **Localizar a todos** (pide una posición nueva a cada teléfono, tras una confirmación).

## Solución de problemas

- **«Life360 rechazó el token de acceso»**: el token caducó o se copió mal. Copie uno nuevo
  (paso 1).
- **«Life360 rechazó el inicio de sesión»** con usuario y contraseña: Life360 quiere un código de
  verificación. Cambie al método del token de acceso.
- **«Life360 limita las peticiones»**: la integración espera el tiempo que pide Life360 y luego
  continúa. Aumente el intervalo de actualización.
- **Un miembro siempre está fuera**: compruebe las coordenadas de la casa de Gladys, aumente el
  radio de casa o escriba el nombre de su lugar de Life360 para casa.
- **Sin posición para un miembro**: desactivó la ubicación compartida en la app Life360, o su
  teléfono no se ha comunicado desde hace un rato (ahorro de batería, sin red).

## Privacidad

El token y la contraseña se quedan en los campos secretos de la integración y solo se envían a
Life360. Las posiciones solo se publican en su Gladys. Vea
[SECURITY.md](https://github.com/prohand/gladys-life360/blob/main/SECURITY.md).
