# medidorPK

Mide tramos de carretera con el GPS del móvil: pulsa **Iniciar** al empezar y **Terminar** al acabar.
Guarda historial, calcula el PK final, muestra el recorrido en un mapa y exporta a WhatsApp/email, GPX o CSV (Excel).

## Instalar

- **iPhone (PWA)**: abre https://jorgeurenarubia.github.io/medidorPK/ en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
  Mientras mides, deja la app abierta con la pantalla encendida (iOS no da GPS a una web con la pantalla bloqueada).

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173  (añade ?simular=10 para GPS simulado)
npm test             # tests de distancia, PK y filtrado GPS
npm run build        # PWA en dist/
```

Cada `git push` a `main` publica la PWA en GitHub Pages (pestaña *Actions*).
