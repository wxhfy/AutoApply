const input = document.querySelector('#school');
const box = document.querySelector('.suggestions');
input.addEventListener('input', () => setTimeout(() => {
  box.innerHTML = '<div role="option" class="suggestion">燕山大学</div>';
  box.style.display = 'block';
}, 200));
box.addEventListener('click', () => {
  input.value = '燕山大学';
  input.closest('.autocomplete').querySelector('input[type=hidden]').value = 'ysu-001';
  box.style.display = 'none';
});
