<footer class="bg-gray-200 dark:bg-gray-800 text-center py-4 mt-8">
    <p class="font-semibold">View-IPTV.stream</p>
    <p>Copyright &copy; 2025 Sideways Thought LLC.</p>
    <p><a href="index.php" class="text-blue-600 hover:underline">Home</a> | <a href="privacy.php" class="text-blue-600 hover:underline">Privacy Policy</a></p>
</footer>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('themeSelect');
    if (!select) return;

    const apply = (value) => {
      if (value === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (value === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    const saved = localStorage.getItem('theme') || 'system';
    select.value = saved;
    select.addEventListener('change', () => {
      const value = select.value;
      localStorage.setItem('theme', value);
      apply(value);
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if ((localStorage.getItem('theme') || 'system') === 'system') {
        apply('system');
      }
    });
  });
</script>
