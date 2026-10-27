// -----------------------------------------------------------------------------
// A self-signed certificate for 127.0.0.1 / localhost, valid until 2126, for the
// in-process TLS server of test/https.test.js. Test fixture only: it protects
// nothing and is never used by the integration.
// -----------------------------------------------------------------------------

export const TEST_KEY = `
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg3V1AMcPqjUvRXw+T
i6Jt8GVU0pElqmJ7+RROrOQsjkmhRANCAAQzhB8e56g3p+aRP70yonGtrwTmRsk+
6d443wGKP89EfS8yc2uTcHBOSKLHOBU1N0bzj4rzZx5n1gwCZMYZbmwp
-----END PRIVATE KEY-----
`;

export const TEST_CERT = `
-----BEGIN CERTIFICATE-----
MIIBmjCCAUGgAwIBAgIUWwWTBqk6K+utxndBJV8l5gSXvTAwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAyNzE2NDkzMVoYDzIxMjYxMDAz
MTY0OTMxWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAAQzhB8e56g3p+aRP70yonGtrwTmRsk+6d443wGKP89EfS8yc2uTcHBO
SKLHOBU1N0bzj4rzZx5n1gwCZMYZbmwpo28wbTAdBgNVHQ4EFgQUFrBK9FL+i3S5
cPGTW91UE3OnbTowHwYDVR0jBBgwFoAUFrBK9FL+i3S5cPGTW91UE3OnbTowDwYD
VR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SHBH8AAAEwCgYIKoZI
zj0EAwIDRwAwRAIgPOsMqcRDA0E2guAg3uLw8wRE9D5nFlgPP1b6y/jZBzwCIEhq
VtVBU0kxrwbCdrC37TdN55VKiMi0bZpoaKOenBah
-----END CERTIFICATE-----
`;
