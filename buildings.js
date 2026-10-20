// База данных построек и пути к спрайтам

const BUILDINGS = {
  c: { id: 'c', n: 'Трасса', e: '🛤', cost: { m: 1 }, hp: 25, net: 'c', d: 'Сеть: твердые ресурсы и энергия' },
  y: { id: 'y', n: 'Труба', e: '🚰', cost: { m: 1 }, hp: 25, net: 'y', d: 'Сеть: водоснабжение' },
  d: { id: 'd', n: 'Бур', e: '⛏', cost: { m: 10 }, hp: 100, isDrill: true, powerDrain: 1.0, d: 'Добыча руды, кристаллов или льда' },
  s: { id: 's', n: 'Солнечная', e: '☀️', cost: { m: 12 }, hp: 90, powerGen: 3.0, d: '+3⚡ днем, 0 ночью' },
  b: { id: 'b', n: 'Батарея', e: '🔋', cost: { m: 15, k: 5 }, hp: 120, batCap: 40, d: 'Хранит 40⚡' },
  q: { id: 'q', n: 'Резервуар', e: '🛢️', cost: { m: 20, k: 5 }, hp: 140, waterCap: 200, d: '+200 к лимиту воды' },
  g: { id: 'g', n: 'Теплица', e: '🌱', cost: { m: 20 }, hp: 100, waterDrain: 0.4, powerDrain: 1.5, foodGen: 0.9, reqBoth: true, d: '💧0.4 + ⚡1.5 → 🌱0.9/с' },
  h: { id: 'h', n: 'Жилой модуль', e: '🏠', cost: { m: 25, k: 10 }, hp: 150, popCap: 6, d: '+6 жителей' },
  w: { id: 'w', n: 'Склад', e: '📦', cost: { m: 30 }, hp: 150, resCap: 150, d: '+150 к лимиту склада' },
  a: { id: 'a', n: 'Казарма', e: '⚔️', cost: { m: 40 }, hp: 200, isBarracks: true, d: 'Тап по казарме: заказать солдата (20🔩, во время работы ⚡2/с, 10 с)' }
};

const SPRITES_SRC = {
  d: 'image/cropped-image.png',
  s: 'image/cropped-image (1).png',
  b: 'image/cropped-image (2).png',
  q: 'image/cropped-image (3).png',
  g: 'image/cropped-image (4).png',
  h: 'image/cropped-image (5).png',
  w: 'image/cropped-image (6).png'
};