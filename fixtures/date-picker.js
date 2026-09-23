const trigger = document.querySelector('[data-date-picker]');
const popup = document.querySelector('.date-popup');
const value = document.querySelector('.date-value');

trigger.addEventListener('click', () => {
  popup.innerHTML = '<button type="button" data-value="2027-05">2027年5月</button><button type="button" data-value="2027-06">2027年6月</button>';
  popup.hidden = false;
});

popup.addEventListener('click', event => {
  const option = event.target.closest('[data-value]');
  if (!option) return;
  value.textContent = option.textContent;
  trigger.dataset.value = option.dataset.value;
  popup.hidden = true;
});
