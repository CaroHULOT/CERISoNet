import { Component, OnInit, OnDestroy, ElementRef, signal, input, viewChild, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Post, PostService } from '../post';
import { SocketService } from '../socket.service';
import { PostCardComponent } from '../post-card/post-card';

@Component({
  selector: 'app-mur',
  standalone: true,
  imports: [FormsModule, PostCardComponent],
  templateUrl: './mur.html',
  styleUrls: ['./mur.css']
})
/**
 * MUR COMPONENT
 * Où s'affiche le flux de posts.
 * Il gère : Le chargement initial, le scrolling infini, les filtres et le temps réel.
 */
export class MurComponent implements OnInit, OnDestroy {
  // Inputs reçus du composant parent (App)
  currentUserId = input<number | null>(null);
  currentPseudo = input<string | null>(null);

  // Signaux Angular
  posts = signal<Post[]>([]);
  page = signal(1); // Page actuelle pour la pagination
  limit = signal(10); // Nombre de posts par chargement
  loading = signal(false);
  hasMore = signal(true); // Indique s'il reste des posts à charger

  searchTag = signal(''); // Tag recherché
  currentSort = signal('date'); // Tri actuel (date, likes, etc.)
  filterByMe = signal(false); // Mode "Mes posts"

  onlineUsers = signal<string[]>([]); // Liste des pseudos connectés

  scrollAnchor = viewChild<ElementRef>('scrollAnchor');

  constructor(
    private postService: PostService,
    private socketService: SocketService
  ) {
    effect(() => {
      const anchor = this.scrollAnchor();
      if (anchor) {
        this.setupIntersectionObserver(anchor.nativeElement);
      }
    });
  }

  ngOnInit() {
    this.refresh(); // Premier chargement des posts

    /**
     * ECOUTE DES EVENEMENTS WEBSOCKET 
     */

    // Si quelqu'un publie un post, on rafraîchit le mur
    this.socketService.listen<void>('postCreated').subscribe(() => {
      this.refresh();
    });

    // Si quelqu'un se connecte/déconnecte, on met à jour la liste latérale
    this.socketService.listen<void>('userStatusChange').subscribe(() => {
      this.fetchOnlineUsers();
    });

    // Mise à jour des LIKES en direct sur le bon post
    this.socketService.listen<any>('likeUpdated').subscribe((data) => {
      this.posts.update(list => list.map(p =>
        p._id === data.postId ? { ...p, likes: data.likes } : p
      ));
    });

    // Ajout des COMMENTAIRES en direct
    this.socketService.listen<any>('commentAdded').subscribe((data) => {
      this.posts.update(list => list.map(p => {
        if (p._id === data.postId) {
          const comments = p.comments ? [...p.comments] : [];
          // On vérifie si on n'a pas déjà ajouté ce commentaire localement
          const exists = comments.some(c => c.text === data.comment.text && c.date === data.comment.date && c.hour === data.comment.hour);
          if (!exists) comments.push(data.comment);
          return { ...p, comments };
        }
        return p;
      }));
    });

    this.fetchOnlineUsers(); // Chargement initial des connectés
  }

  ngOnDestroy() { }

  /**
   * Récupère la liste des pseudos connectés via PostgreSQL
   */
  fetchOnlineUsers() {
    this.postService.getOnlineUsers().subscribe({
      next: (res) => this.onlineUsers.set(res),
      error: (err) => console.error("Erreur online users", err)
    });
  }

  /**
   * CONFIGURATION DU SCROLL INFINI
   * Utilise l'IntersectionObserver pour détecter quand l'utilisateur arrive en bas.
   */
  setupIntersectionObserver(element: HTMLElement) {
    const options = { root: null, rootMargin: '0px', threshold: 0.1 };

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.loading() && this.hasMore()) {
        this.loadMore(); // On charge la suite
      }
    }, options);

    observer.observe(element);
  }

  /**
   * CHARGEMENT DES POSTS 
   * Gère les filtres de tri et de hashtags.
   */
  loadPosts(append: boolean = true) {
    if (this.loading()) return;
    this.loading.set(true);

    const params: any = {};
    if (this.searchTag()) params.hashtag = this.searchTag();
    if (this.filterByMe() && this.currentUserId()) params.createdBy = this.currentUserId();
    if (this.currentSort()) {
      params.sortBy = this.currentSort();
      params.order = 'desc';
    }

    this.postService.getPosts(this.page(), this.limit(), params).subscribe({
      next: (res) => {
        const newPosts = res.posts || [];
        if (append) {
          this.posts.update(prev => [...prev, ...newPosts]); // Ajoute à la suite
        } else {
          this.posts.set(newPosts); // Remplace tout (pour refresh/filtre)
        }
        this.hasMore.set(newPosts.length === this.limit());
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Erreur chargement posts', err);
        this.loading.set(false);
      }
    });
  }

  /**
   * Remet le mur à zéro
   */
  refresh() {
    this.page.set(1);
    this.hasMore.set(true);
    this.loadPosts(false);
  }

  /**
   * Incrémente la page et charge la suite (Scroll Infini)
   */
  loadMore() {
    if (this.hasMore() && !this.loading()) {
      this.page.update(p => p + 1);
      this.loadPosts(true);
    }
  }

  /**
   * EVENEMENTS DE FILTRAGE
   */
  onSortChange(event: any) {
    this.currentSort.set(event.target.value);
    this.refresh();
  }

  filterMyPosts() {
    this.filterByMe.set(true);
    this.refresh();
  }

  loadAllPosts() {
    this.filterByMe.set(false);
    this.refresh();
  }

  filterByTag() {
    this.refresh();
  }
}