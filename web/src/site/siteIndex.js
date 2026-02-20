export function createSiteIndexes(sites, columns) {
  const customers = [];
  const namesByCustomer = new Map();
  const siteIdByCustomerName = new Map();
  const seenCustomers = new Set();

  for (const row of sites) {
    const customer = normalizeCell(row[columns.CUSTOMER]);
    const name = normalizeCell(row[columns.NAME]);
    const siteId = normalizeCell(row[columns.SITE_ID]);

    if (!customer || !name || !siteId) continue;

    if (!seenCustomers.has(customer)) {
      seenCustomers.add(customer);
      customers.push(customer);
      namesByCustomer.set(customer, []);
    }

    const names = namesByCustomer.get(customer);
    if (names && !names.includes(name)) names.push(name);

    const key = toCustomerNameKey(customer, name);
    if (!siteIdByCustomerName.has(key)) {
      // Keep first encountered Site_ID if duplicate customer-name entries exist.
      siteIdByCustomerName.set(key, siteId);
    }
  }

  customers.sort(sortTextAscending);
  for (const names of namesByCustomer.values()) {
    names.sort(sortTextAscending);
  }

  return { customers, namesByCustomer, siteIdByCustomerName };
}

export function deriveSiteId(siteIdByCustomerName, customer, name) {
  if (!customer || !name) return "";
  return siteIdByCustomerName.get(toCustomerNameKey(customer, name)) || "";
}

function normalizeCell(value) {
  return (value ?? "").toString().trim();
}

function toCustomerNameKey(customer, name) {
  return `${customer}||${name}`;
}

function sortTextAscending(a, b) {
  return a.localeCompare(b);
}
