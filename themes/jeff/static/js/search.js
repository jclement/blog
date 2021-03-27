var lunrIndex, pagesIndex;

function initLunr() {
    // First retrieve the index file
    $.getJSON("/lunr.json")
        .done(function(index) {
            pagesIndex = index;

            // Set up lunrjs by declaring the fields we use
            // Also provide their boost level for the ranking
            lunrIndex = lunr(function() {
                this.field("title", {
                    boost: 10
                });
                this.field("tags", {
                    boost: 5
                });
                this.field("content");

                // ref is the result item identifier (I chose the page URL)
                this.ref("href");

                pagesIndex.forEach(function(page) {
                    this.add(page);
                }, this);
            });

            // Feed lunr with each file and let lunr actually index them
        })
        .fail(function(jqxhr, textStatus, error) {
            var err = textStatus + ", " + error;
            console.error("Error getting Hugo index file:", err);
        });
}

// Nothing crazy here, just hook up a listener on the input field
function initUI() {
    var $root = $("#modalSearch");
    var $results = $root.find("#results");

    $root.on("show.bs.modal", function(e) {
        $root.find("#search").val("");
        if (!lunrIndex) {
            initLunr();
        }
    });

    $root.find("#search").keyup(function() {
        var query = $(this).val();
        var results = search(query);
        if (!query) {
            $root.find("#resultsPane").hide();
            $root.find("#noResultsPane").hide();
        } else if (!results.length || query.length < 2) {
            $root.find("#resultsPane").hide();
            $root.find("#noResultsPane").show();
        } else {
            $root.find("#resultsPane").show();
            $root.find("#noResultsPane").hide();
            $results.empty();
            renderResults($results, results);
        }
    });
}

/**
 * Trigger a search in lunr and transform the result
 *
 * @param  {String} query
 * @return {Array}  results
 */
function search(query) {
    // Find the item in our index corresponding to the lunr one to have more info
    // Lunr result: 
    //  {ref: "/section/page1", score: 0.2725657778206127}
    // Our result:
    //  {title:"Page1", href:"/section/page1", ...}
    return lunrIndex.search(query).map(function(result) {
            return pagesIndex.filter(function(page) {
                return page.href === result.ref;
            })[0];
        });
}

/**
 * Display the 10 first results
 *
 * @param  {Array} results to display
 */
function renderResults($results, results) {
    if (!results.length) {
        return;
    }

    // Only show the ten first results
    results.slice(0, 10).forEach(function(result) {
        var $result = $("<li>");
        $result.append($("<a>", {
            href: result.href,
            text: "» " + result.title
        }));
        $results.append($result);
    });
}

$(document).ready(function() {
    initUI();
});