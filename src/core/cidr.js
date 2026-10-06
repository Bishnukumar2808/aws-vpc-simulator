/**
 * CIDR & IPv4 Utilities using Unsigned 32-bit Integer Math (>>> 0).
 * AWS VPC reserves 5 IP addresses per subnet:
 * - .0: Network address
 * - .1: Router address
 * - .2: DNS server
 * - .3: Reserved for future use
 * - .255 (or last IP): Broadcast address
 */

/**
 * Converts an IPv4 string (e.g. "10.0.1.4") to an unsigned 32-bit integer.
 * Returns null if the format or octets are invalid.
 */
export function ipToInt(ipStr) {
  if (typeof ipStr !== 'string') return null;
  const parts = ipStr.trim().split('.');
  if (parts.length !== 4) return null;
  let intVal = 0;
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    if (!/^\d+$/.test(part)) return null;
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) return null;
    intVal = (intVal << 8) | num;
  }
  return intVal >>> 0;
}

/**
 * Converts an unsigned 32-bit integer back to an IPv4 string (e.g. "10.0.1.4").
 */
export function intToIp(intVal) {
  const uInt = intVal >>> 0;
  return [
    (uInt >>> 24) & 255,
    (uInt >>> 16) & 255,
    (uInt >>> 8) & 255,
    uInt & 255
  ].join('.');
}

/**
 * Parses and validates a CIDR block (e.g. "10.0.0.0/16").
 * Strict mode ensures host bits are 0 (e.g., "10.0.0.5/16" is invalid).
 */
export function parseCidr(cidrStr, strictHostZero = true) {
  if (typeof cidrStr !== 'string') return { valid: false, error: 'CIDR must be a string.' };
  const parts = cidrStr.trim().split('/');
  if (parts.length !== 2) return { valid: false, error: 'Invalid CIDR format (must be IP/prefix).' };

  const ipPart = parts[0];
  const maskPart = parts[1];

  const ipInt = ipToInt(ipPart);
  if (ipInt === null) return { valid: false, error: 'Invalid IPv4 address format.' };

  if (!/^\d+$/.test(maskPart)) return { valid: false, error: 'Prefix mask must be an integer.' };
  const mask = parseInt(maskPart, 10);
  if (mask < 0 || mask > 32) return { valid: false, error: 'Prefix mask must be between /0 and /32.' };

  // Calculate subnet mask bitmask as unsigned 32-bit integer
  const maskInt = mask === 0 ? 0 : ((0xFFFFFFFF << (32 - mask)) >>> 0);
  const networkInt = (ipInt & maskInt) >>> 0;

  // Strict check: host bits must be zero for network CIDRs (e.g., 10.0.0.5/16 is invalid)
  if (strictHostZero && ipInt !== networkInt) {
    return {
      valid: false,
      error: `Invalid network CIDR: host bits must be zero. Did you mean ${intToIp(networkInt)}/${mask}?`
    };
  }

  // Broadcast integer = networkInt OR inverted maskInt
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;
  const totalIps = Math.pow(2, 32 - mask);

  // AWS reserves 5 IPs per subnet: network (.0), router (.1), DNS (.2), future (.3), broadcast (.255 for /24)
  // Usable IPs = total - 5 (if total <= 5, usable is 0)
  const usableIps = totalIps <= 5 ? 0 : totalIps - 5;

  // First usable instance IP is networkInt + 4 (since .1=router, .2=DNS, .3=future)
  const rawFirstUsableInt = (networkInt + 4) >>> 0;
  const rawLastUsableInt = (broadcastInt - 1) >>> 0;

  const firstUsableIp = usableIps > 0 ? intToIp(rawFirstUsableInt) : null;
  const lastUsableIp = usableIps > 0 ? intToIp(rawLastUsableInt) : null;

  return {
    valid: true,
    cidr: `${intToIp(networkInt)}/${mask}`,
    ip: intToIp(networkInt),
    mask,
    networkInt,
    broadcastInt,
    maskInt,
    totalIps,
    usableIps,
    firstUsableIp,
    lastUsableIp,
    rawFirstUsableInt,
    rawLastUsableInt
  };
}

/**
 * Checks if parent CIDR completely contains child CIDR.
 */
export function cidrContains(parentCidrObj, childCidrObj) {
  if (!parentCidrObj || !parentCidrObj.valid || !childCidrObj || !childCidrObj.valid) return false;
  return childCidrObj.networkInt >= parentCidrObj.networkInt &&
         childCidrObj.broadcastInt <= parentCidrObj.broadcastInt;
}

/**
 * Checks if CIDR A and CIDR B overlap in IP space.
 */
export function cidrOverlaps(cidrAObj, cidrBObj) {
  if (!cidrAObj || !cidrAObj.valid || !cidrBObj || !cidrBObj.valid) return false;
  return !(cidrAObj.broadcastInt < cidrBObj.networkInt || cidrAObj.networkInt > cidrBObj.broadcastInt);
}

/**
 * Checks if a single IP string falls within a CIDR block.
 */
export function ipInCidr(ipStr, cidrObj) {
  const ipInt = ipToInt(ipStr);
  if (ipInt === null || !cidrObj || !cidrObj.valid) return false;
  return ipInt >= cidrObj.networkInt && ipInt <= cidrObj.broadcastInt;
}

/**
 * Finds the next available usable IP address in a subnet, excluding used IPs.
 */
export function nextFreeIp(subnetCidrObj, usedIpIntsSet = new Set()) {
  if (!subnetCidrObj || !subnetCidrObj.valid || subnetCidrObj.usableIps <= 0) return null;
  for (let ipInt = subnetCidrObj.rawFirstUsableInt; ipInt <= subnetCidrObj.rawLastUsableInt; ipInt++) {
    const uInt = ipInt >>> 0;
    if (!usedIpIntsSet.has(uInt)) {
      return intToIp(uInt);
    }
  }
  return null;
}
