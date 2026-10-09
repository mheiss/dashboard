package cloud.heiss.dashboard.api.model;

import java.util.List;

/** Revision-bound photo page with the total visible count and continuation cursor. */
public record ImagePage(long revision, int totalCount, String endCursor, boolean hasNextPage, List<Image> items) {

    public ImagePage {
        items = List.copyOf(items);
    }
}