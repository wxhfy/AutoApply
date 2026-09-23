const select = document.querySelector('.ant-select');
const menu = document.querySelector('.ant-select-dropdown');
const selected = document.querySelector('.selected');
select.addEventListener('click', () => menu.classList.add('open'));
menu.addEventListener('click', event => {
  if (event.target.matches('.ant-select-item-option')) {
    selected.textContent = event.target.textContent;
    menu.classList.remove('open');
  }
});
