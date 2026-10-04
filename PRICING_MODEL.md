# Modelo de precios NUTRILIFE

Cada producto debe permitir definir el margen de ganancia de manera independiente para cada presentación:

- 100 g
- 500 g
- 1 kg

El costo base se recupera desde el costo mayorista del producto. El administrador introduce un porcentaje de margen distinto para cada presentación. El precio de venta se calcula por separado para cada una.

## Ejemplo

Si el costo base es $1.480 y se desea un margen del 40%:

Precio = costo × (1 + margen/100)

$1.480 × 1,40 = $2.072

Los márgenes de 100 g, 500 g y 1 kg son independientes y no deben existir un margen general ni un costo de packing obligatorio.

## Campos esperados por producto

- costoMayorista
- margen100
- margen500
- margen1000
- precio100
- precio500
- precio1000

Los precios deben recalcularse automáticamente al modificar el costo o cualquiera de los tres márgenes.