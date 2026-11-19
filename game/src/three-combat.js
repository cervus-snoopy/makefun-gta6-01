// three-combat.js — PORT MERCER 3D: combat, weapons, carjacking, car damage.
// Pure state + rules; the render layer draws muzzle flashes, particles and
// screen shake from the events these functions return. No DOM, no three.js.

export const PUNCH_DAMAGE = 10;
export const PUNCH_RANGE = 2.2;
export const PUNCH_COOLDOWN_S = 0.45;
export const PISTOL_DAMAGE = 25;
export const PISTOL_MAG = 12; // rounds per magazine
export const PISTOL_RANGE = 60;
export const PISTOL_COOLDOWN_S = 0.22;
export const ARMOUR_ABSORB = 0.6; // armour absorbs 60% of incoming damage
export const RAM_DAMAGE = 8; // police ram (see three-police.js)
export const CAR_RAM_DAMAGE = 15; // player car ramming a ped / car

// Car damage states (visible in every chase): ok -> smoke -> fire -> boom.
export function carDamageState(car) {
  if (car.health <= 0) return 'wreck';
  if (car.health <= 15) return 'fire';
  if (car.health <= 40) return 'smoke';
  return 'ok';
}

export function createPlayerCombat() {
  return {
    health: 100,
    armour: 0,
    weapon: 'fists', // 'fists' | 'pistol'
    ammoInMag: PISTOL_MAG,
    ammoReserve: 24,
    hasPistol: true, // Leon starts with a borrowed pistol (story: $250 + pistol)
    punchCooldownUntil: 0,
    shootCooldownUntil: 0,
    reloadingUntil: 0,
  };
}

// Armour absorbs 60% until depleted; the rest hits health. Returns damage taken.
export function takeDamage(combat, amount) {
  let remaining = amount;
  if (combat.armour > 0) {
    const absorbed = Math.min(combat.armour, remaining * ARMOUR_ABSORB);
    combat.armour -= absorbed;
    remaining -= absorbed;
  }
  combat.health = Math.max(0, combat.health - remaining);
  return { damageTaken: combat.health <= 0 ? amount : remaining, dead: combat.health <= 0 };
}

export function isDead(combat) {
  return combat.health <= 0;
}

// Punch (F). Returns a hit event or null (out of range / on cooldown).
export function punch(combat, now, targetInRange) {
  if (now < combat.punchCooldownUntil) return null;
  combat.punchCooldownUntil = now + PUNCH_COOLDOWN_S;
  if (!targetInRange) return { type: 'punch', hit: false };
  return { type: 'punch', hit: true, damage: PUNCH_DAMAGE };
}

// Pistol shot (mouse aim, click). Consumes 1 round; empty mag => reload hint.
export function shoot(combat, now) {
  if (combat.weapon !== 'pistol') return { type: 'shoot', ok: false, reason: 'no-pistol' };
  if (now < combat.reloadingUntil) return { type: 'shoot', ok: false, reason: 'reloading' };
  if (now < combat.shootCooldownUntil) return { type: 'shoot', ok: false, reason: 'cooldown' };
  if (combat.ammoInMag <= 0) return { type: 'shoot', ok: false, reason: 'empty' };
  combat.shootCooldownUntil = now + PISTOL_COOLDOWN_S;
  combat.ammoInMag -= 1;
  return { type: 'shoot', ok: true, damage: PISTOL_DAMAGE, ammoLeft: combat.ammoInMag };
}

// Reload (R on foot). Takes 1.2 s; moves reserve rounds into the mag.
export function reload(combat, now) {
  if (combat.weapon !== 'pistol') return { ok: false, reason: 'no-pistol' };
  if (combat.ammoInMag >= PISTOL_MAG) return { ok: false, reason: 'mag-full' };
  if (combat.ammoReserve <= 0) return { ok: false, reason: 'no-reserve' };
  if (now < combat.reloadingUntil) return { ok: false, reason: 'reloading' };
  combat.reloadingUntil = now + 1.2;
  return { ok: true, reloadsAt: combat.reloadingUntil };
}

// Called by the main loop when the reload timer elapses.
export function finishReload(combat) {
  const needed = PISTOL_MAG - combat.ammoInMag;
  const moved = Math.min(needed, combat.ammoReserve);
  combat.ammoInMag += moved;
  combat.ammoReserve -= moved;
  combat.reloadingUntil = 0;
  return { moved, ammoInMag: combat.ammoInMag, ammoReserve: combat.ammoReserve };
}

export function switchWeapon(combat, weapon) {
  if (weapon === 'pistol' && !combat.hasPistol) return false;
  if (weapon !== 'fists' && weapon !== 'pistol') return false;
  combat.weapon = weapon;
  return true;
}

// --- Carjacking (E) --------------------------------------------------------
// Walk up to any parked/traffic car and jack it: the driver flees, the law
// notices (+1 wanted — applied by the caller via addCrime).
export function jackCar(player, car, now) {
  if (!car || car.jacked) return { ok: false, reason: 'already-jacked' };
  const wasOccupied = !!car.occupied;
  car.occupied = false;
  car.jacked = true;
  car.driverFled = true;
  player.inCar = true;
  player.carId = car.id;
  return { ok: true, wasOccupied, crime: 1, car };
}

export function exitCar(player, car) {
  player.inCar = false;
  player.carId = null;
  if (car) car.occupied = false;
  return { ok: true };
}

// --- Car damage ------------------------------------------------------------

export function createCarHealth() {
  return { health: 100 };
}

export function damageCar(car, amount) {
  car.health = Math.max(0, (car.health ?? 100) - amount);
  const state = carDamageState(car);
  return { health: car.health, state, exploded: state === 'wreck' };
}

// Ramming: the player's car hits something. Returns damage to the target and
// a little damage to the player's own car.
export function ram(car, target) {
  const targetRes = target.health !== undefined ? damageCar(target, CAR_RAM_DAMAGE) : null;
  const selfRes = damageCar(car, 3);
  return { target: targetRes, self: selfRes };
}
