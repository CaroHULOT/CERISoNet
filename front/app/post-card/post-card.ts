import { Component, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Post, PostService } from '../post';
import { SocketService } from '../socket.service';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './post-card.html',
  styleUrls: ['./post-card.css']
})
/**
 * CARD
 * Représente un post individuel dans le flux.
 * Gère les interactions : Like, Commenter et Partager.
 */
export class PostCardComponent {
  // Le post à afficher
  post = input.required<Post>();
  currentUserId = input<number | null | undefined>(null);

  showComments = signal(false);
  newCommentText = signal('');

  isSharing = signal(false);
  shareComment = signal('');

  constructor(
    private postService: PostService,
    private socketService: SocketService
  ) { }

  /**
   * Affiche/Masque la section des commentaires
   */
  toggleComments() {
    this.showComments.update(v => !v);
  }

  isAddingComment = signal(false);

  /**
   * AJOUT D'UN COMMENTAIRE
   * Envoie le texte au serveur. Le WebSocket se chargera de mettre à jour le flux pour tout le monde.
   */
  addComment() {
    const text = this.newCommentText().trim();
    if (text && !this.isAddingComment()) {
      this.isAddingComment.set(true);
      this.postService.addComment(this.post()._id, text).subscribe({
        next: () => {
          this.newCommentText.set('');
          this.isAddingComment.set(false);
        },
        error: (err) => {
          console.error("Erreur lors de l'ajout", err);
          this.isAddingComment.set(false);
        }
      });
    }
  }

  /**
   * LIKE / UNLIKE
   * Met à jour le compteur. Le WebSocket s'occupe de synchroniser les autres.
   */
  likePost() {
    this.postService.likePost(this.post()._id).subscribe({
      next: (res) => {
        this.post().likes = res.count;
      },
      error: (err) => console.error("Erreur lors du like", err)
    });
  }

  /**
   * PARTAGE
   * Ouvre la petite zone de texte pour ajouter un commentaire au partage.
   */
  toggleShare() {
    this.isSharing.update(v => !v);
    this.shareComment.set('');
  }

  /**
   * CONFIRMATION DU PARTAGE
   * Utilise WebSockets pour créer le post de partage.
   */
  confirmShare() {
    const comment = this.shareComment().trim();
    if (comment) {
      this.socketService.emitShare(this.post()._id, comment, (res: any) => {
        if (res.success) {
          console.log("✅ Partage réussi !");
        } else {
          alert("Erreur lors du partage : " + res.error);
        }
      });
      this.isSharing.set(false);
      this.shareComment.set('');
    }
  }

  /**
   * Helper pour le template Angular
   */
  isArray(val: any): boolean {
    return Array.isArray(val);
  }
}