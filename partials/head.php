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
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- hls.js -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <!-- dash.js -->
    <script src="https://cdn.dashjs.org/latest/dash.all.min.js"></script>
    <?php include 'partials/analytics.php'; ?>
</head>
