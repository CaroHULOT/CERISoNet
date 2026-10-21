import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PostService } from '../post';

@Component({
  selector: 'app-create-post',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './create-post.html',
  styleUrls: ['./create-post.css']
})
/**
 * CREATE POST COMPONENT
 * Gère le formulaire de création de nouveau post.
 */
export class CreatePostComponent {
  // Signaux pour les champs du formulaire
  body = signal('');
  hashtagsText = signal('');
  imageUrl = signal('');

  postCreated = output<void>();

  constructor(private postService: PostService) { }

  /**
   * Gestion des erreurs de chargement d'image pour l'aperçu
   */
  onImageError(event: any) {
    console.warn("L'image n'a pas pu être chargée. Vérifiez l'URL.");
  }

  /**
   * ENVOI DU POST AU SERVEUR
   */
  submitPost() {
    const bodyText = this.body().trim();
    if (!bodyText) return; // pas de post vide

    /**
     * PARSING DES HASHTAGS
     * Transforme une chaîne "tag1, tag2" en tableau ["#tag1", "#tag2"]
     */
    let parsedHashtags: string[] = [];
    const hText = this.hashtagsText().trim();
    if (hText) {
      parsedHashtags = hText
        .split(/[\s,]+/) // Sépare par espace ou virgule
        .map(t => t.trim())
        .filter(t => t)
        .map(t => t.startsWith('#') ? t : `#${t}`); // Ajoute le # si manquant
    }

    // Construction de l'objet image si une URL est présente
    const img = this.imageUrl().trim() ? { url: this.imageUrl().trim() } : null;

    this.postService.createPost(bodyText, parsedHashtags, img).subscribe({
      next: () => {
        // Reset du formulaire après succès
        this.body.set('');
        this.hashtagsText.set('');
        this.imageUrl.set('');
        this.postCreated.emit(); // Ferme la modale
        this.postService.postCreated$.next(); // Notifie le reste de l'app
      },
      error: (err) => console.error('Erreur creation post', err)
    });
  }
}
