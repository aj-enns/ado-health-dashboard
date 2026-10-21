import { emptySnapshot, validateSnapshot, freshness, selectCells, health } from '../lib/status.mjs';

const $ = id => document.getElementById(id);
let current = emptySnapshot();
const label = value => value.charAt(0).toUpperCase() + value.slice(1);
const formatDate = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not provided';

function badge(value, suffix = '') {
  const node = document.createElement('span');
  node.className = `badge ${health(value)}`;
  node.textContent = `${label(health(value))}${suffix}`;
  return node;
}

function options(id, entries, first) {
  const select = $(id);
  const previous = select.value;
  select.replaceChildren(new Option(first, ''), ...entries.map(([value, name]) => new Option(name, value)));
  if (entries.some(([value]) => value === previous)) select.value = previous;
}

function render() {
  const state = freshness(current);
  const isStale = state === 'stale';
  const overall = current.ok ? current.status.health : 'unknown';
  $('overall-heading').textContent = !current.ok ? 'Health unavailable' : isStale ? 'Snapshot is out of date' : overall === 'healthy' ? 'Overall API reports healthy' : `${label(overall)} status reported`;
  $('overall-message').textContent = current.ok ? current.status.message : current.error;
  $('overall-badge').className = `badge ${isStale ? 'stale' : overall}`;
  $('overall-badge').textContent = isStale ? `Stale / last reported ${overall}` : label(overall);
  $('collected').textContent = current.collectedAt ? formatDate(current.collectedAt) : 'No published check';
  $('source-updated').textContent = formatDate(current.sourceUpdatedAt);
  $('notice').classList.toggle('attention', state !== 'fresh' || overall !== 'healthy');
  $('notice').textContent = !current.ok
    ? 'Collection unavailable. No current healthy state can be inferred. Check collector logs and the official status portal.'
    : isStale
      ? 'This snapshot is at least 40 minutes old or has an invalid clock offset. All values below are historical observations, not current health.'
      : 'Published snapshot, not a live feed. This page reloads the JSON every 60 seconds; only the scheduled collector queries the API.';

  const cells = selectCells(current, $('service').value, $('geography').value);
  $('count').textContent = `${cells.length} service / geography observations`;
  const attention = cells.filter(cell => cell.health !== 'healthy').length;
  $('summary').textContent = !current.ok ? 'No observations available.' : `${attention} of ${cells.length} selected observations need attention (including unknown).${isStale ? ' Last reported values only.' : ''}`;
  const rows = cells.map(cell => {
    const row = document.createElement('tr');
    for (const value of [cell.service, `${cell.name} (${cell.id})`]) {
      const td = document.createElement('td');
      td.textContent = value;
      row.append(td);
    }
    const td = document.createElement('td');
    td.append(badge(cell.health, isStale ? ' / last reported' : ''));
    row.append(td);
    return row;
  });
  if (!rows.length) {
    const row = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = current.ok ? 'No observations match these filters.' : 'Service health is unknown until a successful collection is published.';
    row.append(td);
    rows.push(row);
  }
  $('rows').replaceChildren(...rows);
}

async function reload() {
  $('refresh').disabled = true;
  $('refresh').textContent = 'Loading...';
  try {
    const response = await fetch(`data/status.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
    current = validateSnapshot(await response.json());
  } catch (error) {
    console.error('Snapshot loading failed:', error);
    current = emptySnapshot('The published snapshot could not be loaded or validated. Current service health is unknown.');
  } finally {
    options('service', current.services.map(service => [service.id, service.id]), 'All services');
    const regions = new Map(current.services.flatMap(service => service.geographies.map(region => [region.id, region.name])));
    options('geography', [...regions], 'All geographies');
    render();
    $('refresh').disabled = false;
    $('refresh').textContent = 'Reload snapshot';
  }
}
$('service').addEventListener('change', render);
$('geography').addEventListener('change', render);
$('refresh').addEventListener('click', reload);
await reload();
setInterval(reload, 60_000);
setInterval(render, 15_000);
