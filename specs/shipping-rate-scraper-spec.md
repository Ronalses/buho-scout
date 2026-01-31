# PRD Técnico: Shopify Shipping Rate Scraper v0.0.1

> **Documento:** Product Requirements Document (Técnico)
> **Fecha:** 2026-01-30
> **Versión:** 0.0.1
> **Autor:** Senior Automation Engineer
> **Estado:** Draft

---

## 1. Visión Técnica y Objetivos

### 1.1 Declaración de Visión

Desarrollar un **sistema automatizado de extracción de tarifas de envío** robusto y escalable, diseñado específicamente para tiendas Shopify en el mercado chileno. El sistema debe simular el comportamiento de un usuario real para obtener datos precisos de costos logísticos en zonas geográficas clave, priorizando la estabilidad y la precisión de los datos sobre la velocidad bruta.

### 1.2 Principios de Diseño

| Principio | Descripción |
|-----------|-------------|
| **Resiliencia** | Capacidad de recuperación automática ante fallos de red o selectores cambiantes (Retries & Error Handling). |
| **Precisión Geográfica** | Validación estricta de tarifas para comunas específicas (Santiago, Til Til, Buin). |
| **Recursos Eficiente** | Gestión estricta de instancias de navegador para prevenir fugas de memoria. |
| **Trazabilidad** | Registro detallado del estado de cada extracción (Pending, Processed, Error). |

### 1.3 Alcance del MVP

**Incluido:**
- Iteración sobre lista de URLs de tiendas Shopify.
- Detección dinámica de botones de compra ("Add to Cart").
- Navegación automatizada al Checkout.
- Llenado de formularios con datos simulados para Chile.
- Extracción de tarifas para 3 ubicaciones: Santiago, Til Til, Buin.
- Persistencia de datos en SQLite vía Prisma.
- Modo Headless configurable.

**Excluido:**
- Extracción de productos específicos (se selecciona el primero disponible o predeterminado).
- Soporte para plataformas no-Shopify (WooCommerce, VTEX, etc.).
- Bypassing de captchas complejos (ej. Cloudflare Turnstile en modo agresivo).
- Ejecución distribuida/paralela en múltiples nodos.

---

## 2. Arquitectura del Sistema

### 2.1 Diagrama de Flujo

```mermaid
graph TD
    A[Inicio] --> B{¿Hay Tiendas Pendientes?}
    B -- Sí --> C[Cargar URL Tienda]
    B -- No --> Z[Fin del Proceso]
    C --> D[Detectar Botón 'Add to Cart']
    D --> E[Navegar a Checkout]
    E --> F[Iterar Ubicaciones (3)]
    F --> G[Llenar Formulario Dirección]
    G --> H[Esperar Carga de Tarifas]
    H --> I[Extraer Servicios y Precios]
    I --> J[Persistir en DB]
    J --> F
    F -- Fin Ubicaciones --> K[Marcar Tienda Processed]
    K --> B
    C -- Error --> L[Retry / Marcar Error]
    L --> B
```

### 2.2 Stack Tecnológico

| Componente | Tecnología | Justificación |
|------------|------------|---------------|
| **Runtime** | Node.js + TypeScript | Tipado estático y ecosistema maduro para automatización. |
| **Browser Auto** | Playwright | Mejor manejo de estados asíncronos y shadow DOM que Puppeteer. |
| **ORM** | Prisma | Abstracción de tipos segura y migraciones sencillas. |
| **Database** | SQLite | Almacenamiento local ligero y sin configuración compleja. |

---

## 3. Modelo de Datos (Prisma)

### 3.1 Esquema Propuesto

```prisma
// schema.prisma

model Store {
  id        String   @id @default(uuid())
  url       String   @unique
  status    String   @default("pending") // pending, processed, error
  lastError String?  // Para diagnóstico
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  rates     ShippingRate[]
}

model ShippingRate {
  id          String   @id @default(uuid())
  storeId     String
  store       Store    @relation(fields: [storeId], references: [id])
  comuna      String   // Santiago, Til Til, Buin
  serviceName String   // Ej: "Envío Express", "Starken"
  price       Float
  currency    String   @default("CLP")
  extractedAt DateTime @default(now())
}
```

---

## 4. Especificación Funcional

### 4.1 Lógica de Navegación y Selectores

La automatización debe ser agnóstica al tema de Shopify ("Theme Agnostic"). Se utilizarán estrategias de **selectores inteligentes**:

1.  **Add to Cart:**
    *   Buscar botones que contengan texto: "Agregar al carrito", "Add to cart", "Comprar".
    *   Fallback: Buscar formularios con `/cart/add`.
2.  **Checkout:**
    *   Navegación directa a `/checkout` si no hay redirección automática.
3.  **Formulario de Dirección:**
    *   Uso de atributos `name` comunes en Shopify:
        *   `name="address[address1]"`
        *   `name="address[city]"`
        *   `name="address[zip]"` (o equivalente para Chile si aplica)
    *   Manejo de dropdowns de regiones/comunas específicos de integraciones chilenas (ej. selectores dinámicos).

### 4.2 Casos de Prueba (Geolocalización)

Para cada tienda, se deben ejecutar secuencialmente las siguientes configuraciones de envío:

| Caso | Región | Comuna |
|------|--------|--------|
| **Caso A** | Región Metropolitana | Santiago |
| **Caso B** | Región Metropolitana | Til Til |
| **Caso C** | Región Metropolitana | Buin |

**Validación:**
- Se considera éxito si se extrae al menos una tarifa o si el sitio indica explícitamente "No hay envíos a esta zona".
- Timeout de espera por tarifas: 15 segundos.

### 4.3 Manejo de Errores y Retries

- **Retries:** Configurar 3 intentos por tienda en caso de fallos de red o timeouts.
- **Pop-ups:** Implementar un "Pop-up Killer" que detecte y cierre modales comunes (newsletters, cookies, promociones) que bloqueen la interacción.
- **Limpieza:** Uso de `context.close()` y `browser.close()` en bloques `finally` para asegurar liberación de memoria.

---

## 5. Configuración y Ejecución

### 5.1 Variables de Entorno

```env
DATABASE_URL="file:./dev.db"
HEADLESS_MODE=true # true/false para debugging
MAX_RETRIES=3
BROWSER_TIMEOUT=30000
```

### 5.2 Estructura del Proyecto Recomendada

```
src/
├── config/             # Configuración de Playwright y Env
├── core/
│   ├── browser.ts      # Factory de instancias de navegador
│   ├── navigator.ts    # Lógica de navegación (Add to Cart, Checkout)
│   └── extractor.ts    # Lógica de parsing de tarifas
├── db/
│   └── prisma.ts       # Cliente Prisma
├── scenarios/
│   └── chile-shipping.ts # Definición de direcciones de prueba
└── main.ts             # Punto de entrada y orquestación
```

---

## 6. Plan de Implementación

### Fase 1: Setup & Scaffolding
- [ ] Inicializar proyecto Node.js + TypeScript.
- [ ] Configurar Prisma con SQLite.
- [ ] Configurar Playwright.

### Fase 2: Core Automator
- [ ] Implementar detección de botón de compra.
- [ ] Implementar navegación al checkout.
- [ ] Implementar llenado de formularios dinámico.

### Fase 3: Data Extraction & Persistence
- [ ] Implementar lógica de extracción de tarifas del DOM.
- [ ] Integrar con Prisma para guardar `Store` y `ShippingRate`.

### Fase 4: Robustez y Loop
- [ ] Agregar loop sobre lista de URLs.
- [ ] Implementar manejo de errores y reintentos.
- [ ] Pruebas finales con tiendas reales.

---

**Documento listo para implementación.**
