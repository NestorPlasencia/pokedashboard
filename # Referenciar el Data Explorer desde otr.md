# Referenciar el Data Explorer desde otras webs

## Direccion actual

```text
http://150.136.113.246/explorer
```

Para produccion se recomienda apuntar un dominio al servidor y usar HTTPS, por
ejemplo `https://prices.example.com/explorer`. La IP actual es efimera y podria
cambiar si se elimina o reasigna su recurso de IP publica.

## Enlaces recomendados

### Un TCGplayer Product ID

```text
http://150.136.113.246/explorer?id=272484&scope=product
```

### Varios TCGplayer Product IDs

```text
http://150.136.113.246/explorer?ids=272484,123456,789012&scope=product
```

### Un TCGplayer Group ID

```text
http://150.136.113.246/explorer?id=1234&scope=group
```

### Varios TCGplayer Group IDs

```text
http://150.136.113.246/explorer?ids=1234,5678&scope=group
```

Los IDs deben ser enteros positivos. Se eliminan duplicados y se aceptan hasta
500 IDs por enlace.

## Alias explicitos

Tambien se admiten estos formatos:

```text
/explorer?productId=272484
/explorer?productIds=272484,123456
/explorer?groupId=1234
/explorer?groupIds=1234,5678
```

Los alias determinan el tipo automaticamente. Para integraciones nuevas se
recomienda usar `id` o `ids` junto con `scope=product|group`, porque resulta mas
facil construir un unico componente de enlace.

No mezcle alias de producto y grupo en la misma URL. Si se mezclan, el Explorer
prioriza `groupIds`, `groupId`, `productIds`, `productId`, `ids` e `id`, en ese
orden.

## Enlace HTML

Abrir en otra pestana:

```html
<a
  href="http://150.136.113.246/explorer?id=272484&amp;scope=product"
  target="_blank"
  rel="noopener noreferrer"
>
  Ver historial de precios
</a>
```

Redirigir en la misma pestana:

```html
<a href="http://150.136.113.246/explorer?id=272484&amp;scope=product">
  Abrir Data Explorer
</a>
```

## Construir el enlace con JavaScript

```js
function explorerUrl(ids, scope = "product") {
  const url = new URL("http://150.136.113.246/explorer");
  const normalizedIds = [...new Set(ids.map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 10);

  url.searchParams.set(normalizedIds.length === 1 ? "id" : "ids", normalizedIds.join(","));
  url.searchParams.set("scope", scope);
  return url.toString();
}

window.open(explorerUrl([272484], "product"), "_blank", "noopener,noreferrer");
```

Para redirigir la pestana actual:

```js
window.location.assign(explorerUrl([272484, 123456], "product"));
```

## Ejemplo en React

```tsx
const explorerUrl = new URL("http://150.136.113.246/explorer");
explorerUrl.searchParams.set("id", String(tcgplayerProductId));
explorerUrl.searchParams.set("scope", "product");

return (
  <a href={explorerUrl.toString()} target="_blank" rel="noopener noreferrer">
    Ver precios
  </a>
);
```

## Embeber con iframe

```html
<iframe
  src="http://150.136.113.246/explorer?id=272484&amp;scope=product"
  title="Historial de precios TCGplayer"
  loading="lazy"
  style="width:100%; min-height:800px; border:0;"
></iframe>
```

Una pagina HTTPS normalmente bloqueara un `iframe` HTTP por contenido mixto.
Para embeber el Explorer en una web HTTPS, primero configure un dominio HTTPS
para TCG Platform y use esa direccion HTTPS en `src`.

Si en el futuro se agrega una politica `Content-Security-Policy` con
`frame-ancestors`, se deben autorizar explicitamente los dominios que podran
embeber el Explorer.

## Probar una integracion

1. Pegue la URL construida directamente en el navegador.
2. Confirme que `/explorer` abre sin regresar al dashboard.
3. Confirme que el selector muestra `Producto` o `Grupo` correctamente.
4. Compruebe que todos los IDs solicitados aparecen en la pantalla.
5. En DevTools, confirme que las peticiones `/api/v1/data/...` responden `200`.

## Enlaces y acceso directo a la API

Abrir o embeber el Explorer no requiere CORS porque el frontend consulta su API
en el mismo servidor. Una web externa que quiera consultar `/api/v1` directamente
si puede necesitar una configuracion CORS y autenticacion separada. No exponga
la base de datos ni permita consultas SQL arbitrarias desde el navegador.
