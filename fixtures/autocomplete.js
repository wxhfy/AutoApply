const input = document.querySelector('#school');
const id = document.querySelector('#schoolId');
const box = document.querySelector('.suggestions');
input.addEventListener('input', () => {
  box.innerHTML = '';
  box.classList.remove('open');
  setTimeout(() => {
    if (!input.value) return;
    const option = document.createElement('div');
    option.className = 'suggestion';
    option.setAttribute('role', 'option');
    option.dataset.id = 'ysu-001';
    option.textContent = input.value;
    box.append(option);
    box.classList.add('open');
  }, 200);
});
box.addEventListener('click', event => {
  const option = event.target.closest('.suggestion');
  if (!option) return;
  input.value = option.textContent;
  id.value = option.dataset.id;
  box.classList.remove('open');
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
