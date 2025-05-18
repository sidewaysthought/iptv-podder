<?php
// Set the page title logic
if (empty($pageTitle)) {
    $pageTitle = 'View-IPTV.stream';
} else {
    $pageTitle = $pageTitle . ' | View-IPTV.stream';
}
?>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?php echo htmlspecialchars($pageTitle); ?></title>
    <!-- Tailwind CSS -->
    <script>
        tailwind.config = { darkMode: 'class' };
    </script>
    <script>
        (function() {
            const theme = localStorage.getItem('theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-RXf+QSDCUQs5u3F4dmkB9pGwBuiJTqXrE2RzYhWnEfZ1CMBYHZB+m0XXq20s96VdY+U2/6YdEcXkoP4zTPU3HQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <!-- hls.js -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <?php include 'partials/analytics.php'; ?>
</head>
