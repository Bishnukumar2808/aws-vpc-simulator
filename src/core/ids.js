/**
 * Unique ID generator for AWS resources.
 * Formats: vpc-xxxx, subnet-xxxx, igw-xxxx, rtb-xxxx, sg-xxxx, i-xxxx, rule-xxxx
 */

function randomHex(length = 8) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateId(prefix) {
  return `${prefix}-${randomHex(8)}`;
}
