# Android Dev Build

## Opcao 1: dev build local com Android Studio/emulador

1. Instale Android Studio e configure um SDK/emulador Android.
2. Copie `mobile/.env.example` para `mobile/.env` e ajuste `EXPO_PUBLIC_WS_URL` para o IP da sua maquina.
3. Rode o servidor:

```bash
npm run dev:server
```

4. Gere e instale o app Android nativo:

```bash
npm run android:run
```

5. Depois suba o Metro para dev client:

```bash
npm run dev:mobile:client
```

6. Abra o app "Legends of Gelehk" no Android e conecte ao Metro.

## Opcao 2: dev build remoto com EAS para celular fisico

1. Faça login no Expo:

```bash
npx eas-cli login
```

2. Ajuste `mobile/eas.json` ou use env vars reais para `EXPO_PUBLIC_WS_URL`.
3. Gere o APK/AAB de desenvolvimento:

```bash
npm run android:eas:dev
```

4. Instale o build no celular pelo link/QR da Expo.
5. Rode o servidor:

```bash
npm run dev:server
```

6. Rode o Metro em modo dev client:

```bash
EXPO_PUBLIC_WS_URL=ws://SEU_IP:3002/ws npm run dev:mobile:client
```

## Notas

- O celular precisa estar na mesma rede da maquina do servidor/Metro.
- Nao use `localhost` no celular; use o IP da sua maquina.
- Se usar emulador Android, normalmente o backend fica em `ws://10.0.2.2:3002/ws`.
- Se o build remoto falhar, confira credenciais da Expo e do Android.
